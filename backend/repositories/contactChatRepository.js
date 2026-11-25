/**
 * Contact chat repository: every database operation of the chat.
 *
 * The counters of a conversation (message numbers and unread counts) are changed ONLY here, each by ONE atomic update on the native
 * collection, written as an update pipeline so that the new number and the new unread count are worked out from the same stored values
 * in the same step. Two messages arriving together, or a message arriving while staff mark the thread read, can therefore never lose
 * or double count a message. Mongoose is not used for those updates (it does not apply pipeline updates), so timestamps and defaults
 * are written here.
 *
 * Nothing here reads or writes a plain message text: bodies arrive and leave encrypted.
 */

const mongoose = require('mongoose');
const ContactConversation = require('../models/ContactConversation');
const ContactMessage = require('../models/ContactMessage');
const User = require('../models/User');

const { ObjectId } = mongoose.Types;
const oid = (value) => (value instanceof ObjectId ? value : new ObjectId(String(value)));
const isObjectId = (value) => typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A value that must be taken literally inside an update pipeline (a text that starts with "$" would be read as a field). */
const lit = (value) => ({ $literal: value });
const orZero = (field) => ({ $ifNull: [`$${field}`, 0] });

class ContactChatRepository {
  // ---------------------------------------------------------------- reading

  async findByUser(userId) {
    return ContactConversation.findOne({ user: oid(userId) }).lean();
  }

  async findById(id) {
    if (!isObjectId(String(id))) return null;
    return ContactConversation.findById(oid(id)).lean();
  }

  async findMessageByClientId(conversationId, clientMessageId) {
    return ContactMessage.findOne({ conversation: oid(conversationId), clientMessageId }).lean();
  }

  async findMessagesByIds(ids) {
    if (!ids.length) return [];
    return ContactMessage.find({ _id: { $in: ids.map(oid) } }).lean();
  }

  /** The newest message of one side that is at or before the cursor (to turn "seen up to seq N" into that side's own number). */
  async findLatestOfSideUpTo(conversationId, sender, upToSeq) {
    return ContactMessage.findOne({ conversation: oid(conversationId), sender, seq: { $lte: upToSeq } }).sort({ seq: -1 }).select('senderSeq seq').lean();
  }

  /**
   * Messages in order, oldest first.
   *  - after: those with seq > after (what is new since the last poll);
   *  - before: the page just before that number;
   *  - neither: the newest page.
   * Returns { messages, hasMore } (hasMore: there are older messages not returned, or newer ones when `after` was used).
   */
  async listMessages(conversationId, { after, before, limit }) {
    const conversation = oid(conversationId);
    if (Number.isInteger(after)) {
      const rows = await ContactMessage.find({ conversation, seq: { $gt: after } }).sort({ seq: 1 }).limit(limit + 1).lean();
      return { messages: rows.slice(0, limit), hasMore: rows.length > limit };
    }
    const filter = Number.isInteger(before) ? { conversation, seq: { $lt: before } } : { conversation };
    const rows = await ContactMessage.find(filter).sort({ seq: -1 }).limit(limit + 1).lean();
    return { messages: rows.slice(0, limit).reverse(), hasMore: rows.length > limit };
  }

  /** The inbox: sorted by latest activity. `userIds` / `subjectRegex` together make the search (name or email through the users, or the topic). */
  async listInbox({ status, unreadOnly, search, skip, limit }) {
    const filter = await this.inboxFilter({ status, unreadOnly, search });
    if (filter === null) return { items: [], total: 0 };
    const [items, total] = await Promise.all([
      ContactConversation.find(filter).sort({ lastMessageAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      ContactConversation.countDocuments(filter),
    ]);
    return { items, total };
  }

  async inboxFilter({ status, unreadOnly, search }) {
    const filter = {};
    if (status) filter.status = status;
    if (unreadOnly) filter.unreadForStaff = { $gt: 0 };
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      const users = await User.find({ $or: [{ name: pattern }, { email: pattern }] }).select('_id').limit(this.searchUserLimit || 200).lean();
      const clauses = [{ subject: pattern }];
      if (users.length) clauses.push({ user: { $in: users.map((u) => u._id) } });
      filter.$or = clauses;
    }
    return filter;
  }

  async findUsersByIds(ids) {
    if (!ids.length) return [];
    return User.find({ _id: { $in: ids.map(oid) } }).select('name email phone isDeleted').lean();
  }

  /** The unread total for the staff badge: messages and conversations. */
  async unreadTotals() {
    const rows = await ContactConversation.aggregate([
      { $match: { unreadForStaff: { $gt: 0 } } },
      { $group: { _id: null, unread: { $sum: '$unreadForStaff' }, conversations: { $sum: 1 } } },
    ]);
    return rows[0] ? { unread: rows[0].unread, conversations: rows[0].conversations } : { unread: 0, conversations: 0 };
  }

  // ---------------------------------------------------------------- writing messages

  /**
   * A message from the client, in two steps: (1) ONE atomic update of the conversation (created on the first message) that takes the next
   * numbers, sets the status to open and works out the unread count for staff; (2) the insert of the message with those numbers.
   * If the insert fails the counters are rebuilt from the real messages (`heal`) and the error goes on.
   * Returns { conversation (after the update), message }.
   */
  async appendClientMessage({ userId, messageId, now, subject, phoneEnc, bodyEnc, clientMessageId }) {
    const user = oid(userId);
    const pipeline = [
      {
        $set: {
          user,
          messageCount: { $add: [orZero('messageCount'), 1] },
          clientMsgCount: { $add: [orZero('clientMsgCount'), 1] },
          staffMsgCount: orZero('staffMsgCount'),
          staffSeenClientSeq: orZero('staffSeenClientSeq'),
          clientSeenStaffSeq: orZero('clientSeenStaffSeq'),
          unreadForClient: orZero('unreadForClient'),
          unreadForStaff: { $max: [0, { $subtract: [{ $add: [orZero('clientMsgCount'), 1] }, orZero('staffSeenClientSeq')] }] },
          status: 'open',
          subject: { $ifNull: ['$subject', lit(subject ?? null)] },
          phoneEnc: { $ifNull: ['$phoneEnc', lit(phoneEnc ?? null)] },
          lastMessageAt: now,
          lastMessageBy: 'client',
          lastMessageId: messageId,
          autoClosedAt: '$$REMOVE',
          createdAt: { $ifNull: ['$createdAt', now] },
          updatedAt: now,
        },
      },
    ];
    let conversation = null;
    for (let attempt = 0; attempt < 3 && !conversation; attempt += 1) {
      try {
        conversation = await ContactConversation.collection.findOneAndUpdate({ user }, pipeline, { upsert: true, returnDocument: 'after' });
      } catch (error) {
        if (!(error && error.code === 11000) || attempt === 2) throw error; // two first messages at once: the other one made it, so update that one
      }
    }
    const message = { _id: messageId, conversation: conversation._id, sender: 'client', seq: conversation.messageCount, senderSeq: conversation.clientMsgCount, bodyEnc, createdAt: now };
    if (clientMessageId) message.clientMessageId = clientMessageId;
    try {
      await ContactMessage.create(message);
    } catch (error) {
      await this.heal(conversation._id).catch(() => {});
      throw error;
    }
    return { conversation, message };
  }

  /** A reply from staff: the same two steps. Returns null when the conversation does not exist. */
  async appendStaffMessage({ conversationId, staffUserId, messageId, now, bodyEnc, clientMessageId }) {
    const pipeline = [
      {
        $set: {
          messageCount: { $add: [orZero('messageCount'), 1] },
          staffMsgCount: { $add: [orZero('staffMsgCount'), 1] },
          unreadForClient: { $max: [0, { $subtract: [{ $add: [orZero('staffMsgCount'), 1] }, orZero('clientSeenStaffSeq')] }] },
          status: 'answered',
          lastMessageAt: now,
          lastMessageBy: 'staff',
          lastMessageId: messageId,
          autoClosedAt: '$$REMOVE',
          updatedAt: now,
        },
      },
    ];
    const conversation = await ContactConversation.collection.findOneAndUpdate({ _id: oid(conversationId) }, pipeline, { returnDocument: 'after' });
    if (!conversation) return null;
    const message = { _id: messageId, conversation: conversation._id, sender: 'staff', seq: conversation.messageCount, senderSeq: conversation.staffMsgCount, staffUser: oid(staffUserId), bodyEnc, createdAt: now };
    if (clientMessageId) message.clientMessageId = clientMessageId;
    try {
      await ContactMessage.create(message);
    } catch (error) {
      await this.heal(conversation._id).catch(() => {});
      throw error;
    }
    return { conversation, message };
  }

  // ---------------------------------------------------------------- read cursors (one atomic update each)

  /** Staff have seen the client's messages up to the global number `upToSeq`. Returns the conversation after the update, or null. */
  async markReadByStaff(conversationId, upToSeq) {
    const latest = await this.findLatestOfSideUpTo(conversationId, 'client', upToSeq);
    const target = latest ? latest.senderSeq : 0;
    const seen = { $min: ['$clientMsgCount', { $max: [orZero('staffSeenClientSeq'), target] }] };
    return ContactConversation.collection.findOneAndUpdate(
      { _id: oid(conversationId) },
      [{ $set: { staffSeenClientSeq: seen, unreadForStaff: { $max: [0, { $subtract: ['$clientMsgCount', seen] }] } } }],
      { returnDocument: 'after' }
    );
  }

  /** The client has seen the staff messages up to the global number `upToSeq`. */
  async markReadByClient(conversationId, upToSeq) {
    const latest = await this.findLatestOfSideUpTo(conversationId, 'staff', upToSeq);
    const target = latest ? latest.senderSeq : 0;
    const seen = { $min: ['$staffMsgCount', { $max: [orZero('clientSeenStaffSeq'), target] }] };
    return ContactConversation.collection.findOneAndUpdate(
      { _id: oid(conversationId) },
      [{ $set: { clientSeenStaffSeq: seen, unreadForClient: { $max: [0, { $subtract: ['$staffMsgCount', seen] }] } } }],
      { returnDocument: 'after' }
    );
  }

  /**
   * Rebuilds the counters from the real messages (after a failed insert). Numbers only ever go up (a number that was handed out is never
   * reused); the unread counts are counted exactly.
   */
  async heal(conversationId) {
    const conversation = oid(conversationId);
    const convo = await ContactConversation.findById(conversation).lean();
    if (!convo) return null;
    const [last, lastClient, lastStaff, unreadForStaff, unreadForClient] = await Promise.all([
      ContactMessage.findOne({ conversation }).sort({ seq: -1 }).select('seq').lean(),
      ContactMessage.findOne({ conversation, sender: 'client' }).sort({ senderSeq: -1 }).select('senderSeq').lean(),
      ContactMessage.findOne({ conversation, sender: 'staff' }).sort({ senderSeq: -1 }).select('senderSeq').lean(),
      ContactMessage.countDocuments({ conversation, sender: 'client', senderSeq: { $gt: convo.staffSeenClientSeq || 0 } }),
      ContactMessage.countDocuments({ conversation, sender: 'staff', senderSeq: { $gt: convo.clientSeenStaffSeq || 0 } }),
    ]);
    return ContactConversation.collection.findOneAndUpdate(
      { _id: conversation },
      [{
        $set: {
          messageCount: { $max: [orZero('messageCount'), last ? last.seq : 0] },
          clientMsgCount: { $max: [orZero('clientMsgCount'), lastClient ? lastClient.senderSeq : 0] },
          staffMsgCount: { $max: [orZero('staffMsgCount'), lastStaff ? lastStaff.senderSeq : 0] },
          unreadForStaff,
          unreadForClient,
        },
      }],
      { returnDocument: 'after' }
    );
  }

  // ---------------------------------------------------------------- status, stale conversations, delete

  async setStatus(conversationId, status, now) {
    return ContactConversation.findOneAndUpdate(
      { _id: oid(conversationId) },
      { $set: { status, updatedAt: now }, $unset: { autoClosedAt: 1 } },
      { new: true }
    ).lean();
  }

  /** Closes one user's conversation if it has had no message since `cutoff`. Status only. Returns true when it changed. */
  async closeStaleForUser(userId, cutoff, now) {
    const changed = await ContactConversation.findOneAndUpdate(
      { user: oid(userId), status: { $in: ['open', 'answered'] }, lastMessageAt: { $lt: cutoff } },
      { $set: { status: 'closed', autoClosedAt: now, updatedAt: now } }
    ).lean();
    return Boolean(changed);
  }

  /** The same for every conversation (the inbox calls this at most every few minutes). Returns how many were closed. */
  async closeStaleAll(cutoff, now) {
    const result = await ContactConversation.updateMany(
      { status: { $in: ['open', 'answered'] }, lastMessageAt: { $lt: cutoff } },
      { $set: { status: 'closed', autoClosedAt: now, updatedAt: now } }
    );
    return result.modifiedCount || 0;
  }

  /** Permanently removes a conversation and all its messages. Returns { conversation, messages } counts, or null when there was none. */
  async deleteConversation(conversationId) {
    const conversation = oid(conversationId);
    const removed = await ContactConversation.findOneAndDelete({ _id: conversation }).lean();
    if (!removed) return null;
    const messages = await ContactMessage.deleteMany({ conversation });
    return { conversation: 1, messages: messages.deletedCount || 0 };
  }

  // ---------------------------------------------------------------- email throttle

  /**
   * Takes the right to send one email for this conversation and direction, once per `throttleMs`. One atomic update: of two requests at
   * the same moment only one wins. Returns { previous } (the old time, or null) when taken, or null when it is too soon.
   */
  async claimEmailSlot(conversationId, field, now, throttleMs) {
    const before = await ContactConversation.collection.findOneAndUpdate(
      { _id: oid(conversationId), $or: [{ [field]: null }, { [field]: { $exists: false } }, { [field]: { $lte: new Date(now.getTime() - throttleMs) } }] },
      { $set: { [field]: now } },
      { returnDocument: 'before' }
    );
    return before ? { previous: before[field] || null } : null;
  }

  /** Gives the slot back when the email could not be sent, so a later message can try again. */
  async releaseEmailSlot(conversationId, field, previous, now) {
    await ContactConversation.collection.updateOne({ _id: oid(conversationId), [field]: now }, previous ? { $set: { [field]: previous } } : { $unset: { [field]: '' } });
  }
}

module.exports = new ContactChatRepository();
module.exports.ContactChatRepository = ContactChatRepository;
module.exports.isObjectId = isObjectId;

const mongoose = require('mongoose');

/**
 * One chat conversation per user (the unique index on `user`). Name and email are NEVER copied here: they are read from the account.
 *
 * The counters are changed only by single atomic updates (repositories/contactChatRepository.js, which uses update pipelines on the
 * native collection, so Mongoose never touches them):
 *   messageCount        every message, either side: the cursor numbers the client polls with (message.seq)
 *   clientMsgCount      messages of the client; staffMsgCount: messages of staff (message.senderSeq)
 *   staffSeenClientSeq  how many client messages staff have seen; clientSeenStaffSeq: how many staff messages the client has seen
 *   unreadForStaff      clientMsgCount - staffSeenClientSeq, stored so it can be summed and indexed; unreadForClient mirrors it
 * The phone number is encrypted (AES-256-GCM, the field cipher). The topic (subject) is plain text so staff can search it.
 */
const contactConversationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['open', 'answered', 'closed'], default: 'open' },
    subject: { type: String, maxlength: 80 },
    phoneEnc: { type: String },
    messageCount: { type: Number, default: 0 },
    clientMsgCount: { type: Number, default: 0 },
    staffMsgCount: { type: Number, default: 0 },
    staffSeenClientSeq: { type: Number, default: 0 },
    clientSeenStaffSeq: { type: Number, default: 0 },
    unreadForStaff: { type: Number, default: 0 },
    unreadForClient: { type: Number, default: 0 },
    lastMessageAt: { type: Date },
    lastMessageBy: { type: String, enum: ['client', 'staff'] },
    lastMessageId: { type: mongoose.Schema.Types.ObjectId },
    autoClosedAt: { type: Date },
    lastAdminEmailAt: { type: Date },
    lastClientEmailAt: { type: Date },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  { collection: 'contactconversations', versionKey: false }
);

contactConversationSchema.index({ user: 1 }, { unique: true });
contactConversationSchema.index({ lastMessageAt: -1 });
contactConversationSchema.index({ status: 1, lastMessageAt: -1 });
contactConversationSchema.index({ unreadForStaff: 1 }, { partialFilterExpression: { unreadForStaff: { $gt: 0 } } });

module.exports = mongoose.model('ContactConversation', contactConversationSchema);

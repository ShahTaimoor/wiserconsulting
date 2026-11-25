const mongoose = require('mongoose');

/**
 * One message of a chat conversation. The text is stored ONLY encrypted (`bodyEnc`, AES-256-GCM with the field cipher; the additional
 * authenticated data names the user and the message id, so a copy moved to another message or user fails to decrypt).
 *
 *   seq          the conversation's running number over both sides: the cursor the client polls with ("after=<seq>")
 *   senderSeq    the running number among the messages of the same side (what the read cursors count)
 *   clientMessageId  the retry id the client made for this send (a resend with the same id is the same message)
 */
const contactMessageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactConversation', required: true },
    sender: { type: String, enum: ['client', 'staff'], required: true },
    seq: { type: Number, required: true },
    senderSeq: { type: Number, required: true },
    staffUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bodyEnc: { type: String, required: true },
    clientMessageId: { type: String },
    createdAt: { type: Date, required: true },
  },
  { collection: 'contactmessages', versionKey: false }
);

contactMessageSchema.index({ conversation: 1, seq: 1 }, { unique: true });
contactMessageSchema.index({ conversation: 1, sender: 1, senderSeq: 1 }, { unique: true });
contactMessageSchema.index({ conversation: 1, clientMessageId: 1 }, { unique: true, partialFilterExpression: { clientMessageId: { $type: 'string' } } });

module.exports = mongoose.model('ContactMessage', contactMessageSchema);

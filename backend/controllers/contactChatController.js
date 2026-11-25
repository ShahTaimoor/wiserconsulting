/**
 * Contact chat controller: reads the request, calls the service, shapes the answer. No rules here.
 * Client routes (/api/chat/...) NEVER take a conversation id: the conversation is always the signed-in user's own.
 */

const service = require('../services/contactChatService');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');
const securityLog = require('../utils/securityLog');
const { messagesQuerySchema, inboxQuerySchema } = require('../validations/contactChatValidation');

/** The query string checked and read as numbers (validate() leaves req.query as it came). */
const messagesQuery = (req) => messagesQuerySchema.parse({ query: req.query }).query;
const inboxQuery = (req) => inboxQuerySchema.parse({ query: req.query }).query;

class ContactChatController {
  // ----------------------------------------------------------------- public

  status = asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=30');
    return ApiResponse.success(res, service.status(), 'Chat status');
  });

  // ----------------------------------------------------------------- the signed-in client

  conversation = asyncHandler(async (req, res) => {
    const data = await service.clientConversation(req.user._id, messagesQuery(req));
    return ApiResponse.success(res, data, 'Conversation retrieved');
  });

  unread = asyncHandler(async (req, res) => {
    const data = await service.clientUnread(req.user._id);
    return ApiResponse.success(res, data, 'Unread count retrieved');
  });

  send = asyncHandler(async (req, res) => {
    const { status, message, conversation } = await service.sendClientMessage(req.user, req.body);
    return ApiResponse.success(res, { message, conversation }, status === 201 ? 'Message sent' : 'Message already sent', status);
  });

  read = asyncHandler(async (req, res) => {
    const data = await service.clientRead(req.user._id, req.body.upToSeq);
    return ApiResponse.success(res, data, 'Marked as read');
  });

  // ----------------------------------------------------------------- staff

  adminUnread = asyncHandler(async (req, res) => {
    const data = await service.adminUnread();
    return ApiResponse.success(res, data, 'Unread count retrieved');
  });

  adminList = asyncHandler(async (req, res) => {
    const data = await service.listInbox(inboxQuery(req));
    return ApiResponse.success(res, data, 'Conversations retrieved');
  });

  adminConversation = asyncHandler(async (req, res) => {
    const data = await service.adminConversation(req.params.id, messagesQuery(req));
    return ApiResponse.success(res, data, 'Conversation retrieved');
  });

  adminReply = asyncHandler(async (req, res) => {
    const { status, message, conversation } = await service.sendStaffMessage(req.user, req.params.id, req.body);
    return ApiResponse.success(res, { message, conversation }, status === 201 ? 'Reply sent' : 'Reply already sent', status);
  });

  adminRead = asyncHandler(async (req, res) => {
    const data = await service.staffRead(req.params.id, req.body.upToSeq);
    return ApiResponse.success(res, data, 'Marked as read');
  });

  adminStatus = asyncHandler(async (req, res) => {
    const data = await service.setStatus(req.params.id, req.body.status);
    return ApiResponse.success(res, data, 'Status updated');
  });

  adminDelete = asyncHandler(async (req, res) => {
    // The security log line is written BEFORE anything is removed (ids and counts only, never a message).
    await service.deleteConversation(req.params.id, (extra) => securityLog.record('chat_conversation_deleted', req, extra));
    return res.status(204).end();
  });
}

module.exports = new ContactChatController();

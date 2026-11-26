import { formatChatFullTime, formatChatTime, messageText, type ChatMessage } from "@/utils/chatAdmin";

/**
 * The messages of the visitor's conversation: the visitor's own on the right (green), the team's on the left (white). Message text is only
 * ever drawn as a React text node (line breaks kept by the style, long words broken): never as HTML.
 */
export function MessageList({ messages }: { messages: ReadonlyArray<ChatMessage> }) {
  return (
    <ol className="space-y-2.5">
      {messages.map((message) => {
        const mine = message.sender === "client";
        return (
          <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 shadow-sm ${mine ? "rounded-br-sm bg-emerald-700 text-white" : "rounded-bl-sm border border-slate-200 bg-white text-slate-900"}`}>
              <p className={`mb-0.5 text-[11px] font-semibold ${mine ? "text-emerald-50" : "text-slate-700"}`}>{mine ? "You" : "Wiser Consulting team"}</p>
              <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{messageText(message.text)}</p>
              <time dateTime={message.createdAt} title={formatChatFullTime(message.createdAt)} className={`mt-1 block text-right text-[11px] ${mine ? "text-emerald-100" : "text-slate-600"}`}>
                {formatChatTime(message.createdAt)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

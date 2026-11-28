"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_CHAT_LIMITS, getChatLimits, subscribeChatLimits, type ChatLimits } from "@/utils/chatLimits";

/** The chat's length limits: the server's numbers (from GET /api/chat/status) once read, today's numbers before that and whenever the server sends none. */
export function useChatLimits(): ChatLimits {
  return useSyncExternalStore(subscribeChatLimits, getChatLimits, () => DEFAULT_CHAT_LIMITS as ChatLimits);
}

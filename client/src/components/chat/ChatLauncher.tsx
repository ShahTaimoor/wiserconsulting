"use client";

import { usePathname } from "next/navigation";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { useChatStatus } from "@/hooks/useChatVisitor";
import { useAppSelector } from "@/redux/hooks";
import { isAdminRole } from "@/utils/authRole";
import { shouldShowBubble } from "@/utils/chatWidget";

/**
 * Mounted once for the whole site (components in app/ClientLayout.tsx). It draws the chat bubble only on the six public pages of the
 * allow-list, only when the server says chat is on, and never for an administrator. Anywhere else (the Tourist Visa pages, the admin,
 * sign-in and sign-up) and while the answer is not known or could not be read, it draws nothing and keeps no space.
 */
export function ChatLauncher() {
  const pathname = usePathname();
  const user = useAppSelector((state) => state.auth.user);
  const status = useChatStatus();
  const isAdmin = isAdminRole(user?.role);
  if (!shouldShowBubble({ pathname, chat: status.state, isAdmin })) return null;
  const userKey = user ? String(user.email ?? user.name ?? "signed-in") : "";
  return <ChatWidget pathname={pathname ?? "/"} hours={status.hours} signedIn={Boolean(user)} userKey={userKey} />;
}

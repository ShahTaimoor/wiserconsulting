"use client";

import { Suspense } from "react";
import { SheetLoading, SheetPage } from "@/components/admin/Sheet";
import { ChatInbox } from "@/components/admin/chat/ChatInbox";
import ContactsPage from "@/components/admin/contacts/LegacyContactsPage";
import { useChatEnabled } from "@/hooks/useChatAdmin";

/**
 * /admin/contacts. While the chat is switched ON (the server's CHAT_ENABLED, asked through GET /api/chat/status) this is the chat inbox;
 * otherwise it is the old Contact submissions screen, exactly as it always was. Anything but a clear "on" (an error, a 404, no answer)
 * counts as off, so a wrong guess can only fall back to the old screen.
 */
export default function AdminContactsEntry() {
  const chat = useChatEnabled();
  if (chat === "unknown") {
    return (
      <SheetPage title="Contact">
        <SheetLoading />
      </SheetPage>
    );
  }
  if (chat === "open") {
    return (
      <Suspense fallback={<SheetLoading />}>
        <ChatInbox />
      </Suspense>
    );
  }
  return <ContactsPage />;
}

"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { SheetLoading, SheetPage } from "@/components/admin/Sheet";
import ContactDetailPage from "@/components/admin/contacts/LegacyContactDetailPage";
import { useChatEnabled } from "@/hooks/useChatAdmin";

/**
 * /admin/contacts/<id>. While the chat is switched ON, the id is a conversation (the link in the staff email points here): it is shown in
 * the inbox, at /admin/contacts?c=<id>. While it is OFF this is the old Contact submission detail, exactly as it always was.
 */
export default function AdminContactDetailEntry() {
  const chat = useChatEnabled();
  const router = useRouter();
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";

  useEffect(() => {
    if (chat === "open" && id) router.replace(`/admin/contacts?c=${encodeURIComponent(id)}`);
  }, [chat, id, router]);

  if (chat === "closed") return <ContactDetailPage />;
  return (
    <SheetPage title="Contact">
      <SheetLoading />
    </SheetPage>
  );
}

"use client";

import { useState } from "react";
import { Check, History, Mail, MessageSquareText } from "lucide-react";
import { assistantHref } from "@/lib/assistant/active";
import { Sheet } from "@/components/ui/sheet";
import { ButtonLink, IconButton } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Presence } from "@/components/ui/presence";

export interface ConversationSummary {
  id: string;
  title: string;
  channel: "app" | "sms" | "email";
  /** Pre-formatted in the user's timezone, e.g. "Today, 3:40 PM". */
  when: string;
}

/** Past conversations in a sheet; starting a new one stays an explicit choice. */
export function HistorySheet({ conversations, currentId }: { conversations: ConversationSummary[]; currentId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton aria-label="Conversation history" onClick={() => setOpen(true)} disabled={!conversations.length}>
        <History className="size-5" aria-hidden />
      </IconButton>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Conversations"
        footer={
          <ButtonLink href={assistantHref({ fresh: true })} variant="secondary" onClick={() => setOpen(false)}>
            New conversation
          </ButtonLink>
        }
      >
        <ListGroup>
          {conversations.map((c) => (
            <ListRow
              key={c.id}
              href={`/assistant?c=${c.id}`}
              onClick={undefined}
              leading={
                c.channel === "sms" ? (
                  <MessageSquareText className="size-5" aria-hidden />
                ) : c.channel === "email" ? (
                  <Mail className="size-5" aria-hidden />
                ) : (
                  <Presence size={20} />
                )
              }
              title={<span className="line-clamp-1">{c.title}</span>}
              description={`${c.channel === "sms" ? "Text messages · " : c.channel === "email" ? "Email · " : ""}${c.when}`}
              trailing={c.id === currentId ? <Check className="size-4 text-accent" aria-label="Open now" /> : undefined}
            />
          ))}
        </ListGroup>
      </Sheet>
    </>
  );
}

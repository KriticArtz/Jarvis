"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import type { UserMemory } from "@/lib/types/domain";
import type { ActionResult } from "@/lib/actions/result";
import { addMemory, deleteMemory } from "@/lib/actions/tasks";
import { FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function MemoriesEditor({ memories }: { memories: UserMemory[] }) {
  const [state, action] = useActionState<ActionResult, FormData>(addMemory, { ok: false });
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {memories.length ? (
        <ul className="divide-y divide-hairline rounded-2xl bg-surface-2/60">
          {memories.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-[15px]">{m.content}</span>
              <button type="button" disabled={pending} onClick={() => startTransition(() => void deleteMemory(m.id))} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger" aria-label="Forget this">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form action={action} className="flex gap-2">
        <label htmlFor="memory" className="sr-only">
          Something to remember
        </label>
        <Input id="memory" name="content" maxLength={500} placeholder="e.g. I work night shifts on weekends" />
        <SubmitButton variant="secondary" pendingText="…">
          Add
        </SubmitButton>
      </form>
      <FormMessage>{state.ok ? null : state.error}</FormMessage>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { exitDemoToSignup, resetDemo } from "@/lib/actions/demo";
import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";

export function DemoControls() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] leading-relaxed text-muted">
        Everything here is sample data in a private, temporary demo session. Changes only affect this demo. Reset any time to start fresh.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await resetDemo();
              if (res?.error) setError(res.error);
            })
          }
        >
          <RotateCcw className="size-4" /> {pending ? "Resetting…" : "Reset demo"}
        </Button>
        <form action={exitDemoToSignup}>
          <Button type="submit">Create your own {brand.name}</Button>
        </form>
      </div>
      <FormMessage>{error}</FormMessage>
    </div>
  );
}

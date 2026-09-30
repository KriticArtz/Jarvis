"use client";

import { useActionState, useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";
import { brand } from "@/config/brand";
import { startDemo, type DemoState } from "@/lib/actions/demo";
import { FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

const noopSubscribe = () => () => {};

export function StartDemoForm({ label = "Start the demo" }: { label?: string }) {
  const [state, action] = useActionState<DemoState, FormData>(startDemo, {});
  const tz = useSyncExternalStore(noopSubscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "", () => "");
  return (
    <form action={action} className="flex w-full flex-col gap-3">
      <input type="hidden" name="timezone" value={tz} />
      <label htmlFor="demo-name" className="sr-only">
        What should {brand.name} call you? (optional)
      </label>
      <Input id="demo-name" name="name" maxLength={40} autoComplete="given-name" placeholder="Your first name (optional)" className="h-[52px] text-center" />
      <SubmitButton size="lg" className="w-full" pendingText="Setting up your demo…">
        {label} <ArrowRight className="size-4" />
      </SubmitButton>
      <FormMessage>{state.error}</FormMessage>
    </form>
  );
}

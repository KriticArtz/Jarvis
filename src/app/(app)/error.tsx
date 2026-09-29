"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? error.message);
  }, [error]);
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted">We couldn&apos;t load this page. Your data is safe — please try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

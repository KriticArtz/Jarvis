"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Landmark, RefreshCw } from "lucide-react";
import { connectInstitution, createLinkToken, finishReconnect } from "@/lib/actions/money";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Plaid Link, loaded on demand from Plaid's CDN. The browser only ever sees
 * a short-lived link token and Link's one-time public token; the access
 * token is created and kept on the server. Bank credentials are entered in
 * Plaid's own window and never reach this app.
 */

const LINK_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

interface PlaidHandler {
  open: () => void;
  destroy: () => void;
}
declare global {
  interface Window {
    Plaid?: { create: (config: { token: string; onSuccess: (publicToken: string) => void; onExit: (err: unknown) => void }) => PlaidHandler };
  }
}

let loading: Promise<void> | null = null;
function loadPlaid(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = LINK_SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Plaid Link failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function ConnectBankButton({
  reconnectId,
  configured,
  variant = "primary",
  label,
}: {
  /** Reconnect (Plaid update mode) an existing connection. */
  reconnectId?: string;
  /** Bank connections are set up on this server. */
  configured: boolean;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState(false);
  const busy = pending || opening;

  async function open() {
    if (!configured) {
      toast({ title: "Bank connections aren't set up yet", description: "Add Plaid keys on the server to connect accounts.", tone: "neutral" });
      return;
    }
    setOpening(true);
    try {
      const res = await createLinkToken(reconnectId);
      if (!res.ok || !res.linkToken) {
        toast({ title: "Couldn't start the connection", description: res.error, tone: "danger" });
        return;
      }
      await loadPlaid();
      const handler = window.Plaid!.create({
        token: res.linkToken,
        onSuccess: (publicToken) =>
          start(async () => {
            const done = reconnectId ? await finishReconnect(reconnectId) : await connectInstitution(publicToken);
            toast({ title: done.ok ? (reconnectId ? "Reconnected" : "Connected") : "That didn't finish", description: done.ok ? done.message : done.error, tone: done.ok ? "success" : "danger" });
            handler.destroy();
            router.refresh();
          }),
        onExit: () => handler.destroy(),
      });
      handler.open();
    } catch {
      toast({ title: "Couldn't open Plaid", description: "Check your connection and try again. Nothing was changed.", tone: "danger" });
    } finally {
      setOpening(false);
    }
  }

  return (
    <Button variant={variant} onClick={() => void open()} disabled={busy}>
      {reconnectId ? <RefreshCw className="size-4" aria-hidden /> : <Landmark className="size-4" aria-hidden />}
      {busy ? "Connecting…" : (label ?? (reconnectId ? "Reconnect" : "Connect a bank"))}
    </Button>
  );
}

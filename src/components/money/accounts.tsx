"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { disconnectInstitution, refreshMoney } from "@/lib/actions/money";
import { money } from "@/lib/money/format";
import type { MoneyAccount } from "@/lib/money/summary";
import type { Connection } from "@/lib/money/data";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { ConnectBankButton } from "./connect-bank";

const TYPE_LABEL: Record<MoneyAccount["type"], string> = { depository: "Cash", credit: "Credit card", loan: "Loan", investment: "Investments", other: "Other" };

function synced(iso: string | null): string {
  if (!iso) return "Not synced yet";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 2) return "Synced just now";
  if (mins < 60) return `Synced ${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `Synced ${hours} hr ago` : `Synced ${Math.round(hours / 24)} days ago`;
}

/** Connected institutions and their accounts, with refresh / reconnect / disconnect. */
export function AccountsSection({ connections, accounts, configured }: { connections: Connection[]; accounts: MoneyAccount[]; configured: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<Connection | null>(null);
  const refresh = (id?: string) =>
    start(async () => {
      const res = await refreshMoney(id);
      toast({ title: res.ok ? (res.message ?? "Up to date") : "Couldn't refresh", description: res.ok ? undefined : res.error, tone: res.ok ? "success" : "danger" });
      router.refresh();
    });
  const disconnect = () =>
    start(async () => {
      if (!removing) return;
      const res = await disconnectInstitution(removing.id);
      toast({ title: res.ok ? `${removing.institutionName} disconnected` : "Couldn't disconnect", description: res.ok ? res.message : res.error, tone: res.ok ? "neutral" : "danger" });
      setRemoving(null);
      router.refresh();
    });

  return (
    <section aria-labelledby="accounts-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="accounts-title" className="text-title font-semibold">
            Accounts
          </h2>
          <p className="text-[14px] text-muted">Read-only. We can see balances and transactions — never move money.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {connections.length ? (
            <Button variant="secondary" onClick={() => refresh()} disabled={pending}>
              <RefreshCw className="size-4" aria-hidden /> Refresh
            </Button>
          ) : null}
          <ConnectBankButton configured={configured} variant={connections.length ? "secondary" : "primary"} label={connections.length ? "Add an institution" : undefined} />
        </div>
      </div>
      {connections.length ? (
        <div className="flex flex-col gap-8">
          {connections.map((c) => {
            const list = accounts.filter((a) => a.connectionId === c.id);
            return (
              <div key={c.id} data-institution={c.institutionName}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[16px] font-semibold">{c.institutionName}</h3>
                    <p className="flex items-center gap-1.5 text-[13px] text-muted" suppressHydrationWarning>
                      {c.status !== "connected" ? <AlertTriangle className="size-3.5 text-warning" aria-hidden /> : null}
                      {c.status === "reauth_required"
                        ? "Needs you to sign in again"
                        : c.status === "error"
                          ? "Couldn't sync last time"
                          : c.history === "pending"
                            ? "Importing your transactions — refresh in a minute"
                            : c.history === "recent"
                              ? `${synced(c.lastSyncedAt)} · older history still arriving`
                              : synced(c.lastSyncedAt)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {c.status === "reauth_required" ? <ConnectBankButton configured={configured} reconnectId={c.id} variant="secondary" /> : null}
                    <Button variant="ghost" onClick={() => setRemoving(c)} disabled={pending}>
                      Disconnect
                    </Button>
                  </div>
                </div>
                <ul className="divide-y divide-hairline border-y border-hairline">
                  {list.map((a) => (
                    <li key={a.id} className="flex min-h-14 items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-medium">{a.name}</p>
                        <p className="text-[13px] text-muted">
                          {TYPE_LABEL[a.type]}
                          {a.subtype && a.subtype.toLowerCase() !== TYPE_LABEL[a.type].toLowerCase() ? ` · ${a.subtype}` : ""}
                          {a.mask ? ` · ••${a.mask}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="type-num text-[15px] font-medium">
                          {a.currentBalance === null ? "—" : money(a.type === "credit" || a.type === "loan" ? -Math.abs(a.currentBalance) : a.currentBalance, { cents: true })}
                        </p>
                        {a.availableBalance !== null && a.type !== "investment" ? (
                          <p className="type-num text-[12px] text-muted">{money(a.availableBalance, { cents: true })} available</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[15px] text-muted">No accounts connected yet.</p>
      )}
      {removing ? (
        <Sheet
          open
          onClose={() => setRemoving(null)}
          title={`Disconnect ${removing.institutionName}?`}
          footer={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRemoving(null)} className="flex-1">
                Keep it
              </Button>
              <Button variant="danger" onClick={disconnect} disabled={pending} className="flex-1">
                {pending ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          }
        >
          <p className="text-[15px] leading-relaxed text-muted">
            Its accounts and transactions will be removed from here, and our access is revoked at Plaid. Your bank accounts themselves aren’t affected. You can connect again anytime.
          </p>
        </Sheet>
      ) : null}
    </section>
  );
}

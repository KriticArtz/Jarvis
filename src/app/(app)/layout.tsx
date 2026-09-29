import { requireOnboardedUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { BottomNav, SidebarNav } from "@/components/app/nav";
import { DemoBanner } from "@/components/demo/demo-banner";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile, isDemo } = await requireOnboardedUser();
  const initial = (profile.display_name ?? profile.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <>
    {isDemo ? <DemoBanner /> : null}
    <div className="min-h-dvh md:grid md:grid-cols-[256px_1fr]">
      <aside className={isDemo ? "sticky top-10 hidden h-[calc(100dvh-40px)] flex-col px-4 py-6 md:flex" : "sticky top-0 hidden h-dvh flex-col px-4 py-6 md:flex"}>
        <Logo href="/dashboard" className="mb-10 px-3" />
        <SidebarNav />
        <div className="mt-auto flex items-center gap-3 px-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">{initial}</span>
          <div className="min-w-0 text-[13px]">
            <p className="truncate font-medium text-foreground">{profile.display_name}</p>
            <p className="truncate text-muted">{isDemo ? "Demo account" : profile.timezone.replaceAll("_", " ")}</p>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between px-5 pt-5 md:hidden">
          <Logo href="/dashboard" />
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-gradient text-[13px] font-semibold text-white" aria-hidden>
            {initial}
          </span>
        </header>
        <main className="mx-auto w-full max-w-[760px] flex-1 px-5 pb-32 pt-7 md:px-10 md:pb-16 md:pt-12">{children}</main>
      </div>
      <BottomNav />
    </div>
    </>
  );
}

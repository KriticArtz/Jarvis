import { requireOnboardedUser } from "@/lib/auth";
import { resolvePersonalization } from "@/lib/personalization";
import { Logo } from "@/components/logo";
import { BottomNav, SidebarNav } from "@/components/app/nav";
import { PersonalizationShell } from "@/components/app/personalization";
import { DemoBanner } from "@/components/demo/demo-banner";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile, isDemo } = await requireOnboardedUser();
  const { assistantName, theme, appearance } = resolvePersonalization(profile);
  const initial = (profile.display_name ?? profile.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <PersonalizationShell assistantName={assistantName} theme={theme} appearance={appearance} className="min-h-dvh">
      {/* Match <html> (page background, scrollbars) before hydration to avoid a flash. Values are validated enums. */}
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(theme)};document.documentElement.dataset.mode=${JSON.stringify(appearance)};` }} />
      {isDemo ? <DemoBanner /> : null}
      <div className="min-h-dvh md:grid md:grid-cols-[256px_1fr]">
        <aside className={isDemo ? "sticky top-10 hidden h-[calc(100dvh-40px)] flex-col px-4 py-6 md:flex" : "sticky top-0 hidden h-dvh flex-col px-4 py-6 md:flex"}>
          <Logo href="/dashboard" className="mb-10 px-3" />
          <SidebarNav />
          <div className="mt-auto flex items-center gap-3 px-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-foreground">{initial}</span>
            <div className="min-w-0 text-[13px]">
              <p className="truncate font-medium text-foreground">{profile.display_name}</p>
              <p className="truncate text-muted">{isDemo ? "Demo account" : profile.timezone.replaceAll("_", " ")}</p>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] md:hidden">
            <Logo href="/dashboard" />
            <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold text-foreground" aria-hidden>
              {initial}
            </span>
          </header>
          <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-36 pt-6 sm:px-5 md:px-10 md:pb-16 md:pt-12">{children}</main>
        </div>
        <BottomNav />
      </div>
    </PersonalizationShell>
  );
}

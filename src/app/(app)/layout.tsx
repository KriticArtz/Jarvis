import { requireOnboardedUser } from "@/lib/auth";
import { resolvePersonalization } from "@/lib/personalization";
import { MobileHeader } from "@/components/app/mobile-header";
import { NavRail, TabBar } from "@/components/app/nav";
import { PersonalizationShell } from "@/components/app/personalization";
import { DemoBanner } from "@/components/demo/demo-banner";
import { ToastProvider } from "@/components/ui/toast";

/*
 * Signed-in shell. Phones: compact header + bottom tab bar. Tablet and up: a
 * slim navigation rail on the left. Content stays in one intimate column.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile, isDemo } = await requireOnboardedUser();
  const { assistantName, theme, appearance } = resolvePersonalization(profile);

  return (
    <PersonalizationShell assistantName={assistantName} theme={theme} appearance={appearance} className="min-h-dvh">
      {/* Match <html> (page background, scrollbars) before hydration to avoid a flash. Values are validated enums. */}
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(theme)};document.documentElement.dataset.mode=${JSON.stringify(appearance)};` }} />
      <ToastProvider>
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-foreground px-4 py-2 text-[14px] font-medium text-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        {isDemo ? <DemoBanner /> : null}
        <NavRail offsetTop={isDemo} />
        <div className="flex min-h-dvh min-w-0 flex-col md:pl-[84px]">
          <MobileHeader />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[760px] flex-1 has-[[data-layout=wide]]:max-w-[1360px] px-4 pb-36 pt-[max(1.5rem,env(safe-area-inset-top))] outline-none sm:px-6 md:px-10 md:pb-16 md:pt-12">
            {children}
          </main>
        </div>
        <TabBar />
      </ToastProvider>
    </PersonalizationShell>
  );
}

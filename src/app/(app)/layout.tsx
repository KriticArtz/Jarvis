import { requireOnboardedUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { BottomNav, SidebarNav } from "@/components/app/nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireOnboardedUser();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-4 py-5 md:flex">
        <Logo href="/dashboard" className="mb-8 px-2" />
        <SidebarNav />
        <div className="mt-auto px-3 text-sm text-muted">
          <p className="truncate font-medium text-foreground">{profile.display_name}</p>
          <p className="truncate">{profile.timezone}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between px-5 pt-5 md:hidden">
          <Logo href="/dashboard" />
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}

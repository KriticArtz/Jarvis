import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-assistant opacity-80 blur-2xl" />
      <header className="relative px-5 py-5 sm:px-8">
        <Logo />
      </header>
      <main className="relative flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px] animate-rise rounded-[32px] bg-surface p-7 shadow-lift sm:p-9">{children}</div>
      </main>
    </div>
  );
}

import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 py-5 sm:px-8">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm animate-fade-in">{children}</div>
      </main>
    </div>
  );
}

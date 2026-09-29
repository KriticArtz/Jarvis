import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-3 px-5">
      <p className="text-sm font-medium text-muted">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted">That page doesn&apos;t exist or you don&apos;t have access to it.</p>
      <ButtonLink href="/dashboard">Go to Today</ButtonLink>
    </div>
  );
}

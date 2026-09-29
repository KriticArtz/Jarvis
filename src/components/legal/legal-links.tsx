import Link from "next/link";
import { cn } from "@/lib/cn";

/** Small inline links to the Terms of Service and Privacy Policy. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex gap-3", className)}>
      <Link href="/terms" className="hover:text-foreground hover:underline">
        Terms
      </Link>
      <Link href="/privacy" className="hover:text-foreground hover:underline">
        Privacy
      </Link>
    </span>
  );
}

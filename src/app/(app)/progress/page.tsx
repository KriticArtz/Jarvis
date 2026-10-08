import { redirect } from "next/navigation";

/** Progress currently lives at /goals (with the weekly review one tab over); this is its stable entry point. */
export default function ProgressPage() {
  redirect("/goals");
}

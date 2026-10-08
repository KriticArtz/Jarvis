/**
 * Re-mounts on every navigation between app pages, so each page settles in
 * with a short fade-and-rise (instant under reduced motion). The shell
 * (rail, tab bar) lives in the layout and never re-animates.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>;
}

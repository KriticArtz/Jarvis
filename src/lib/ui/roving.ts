/**
 * Keyboard movement for single-select groups (segmented controls, pickers):
 * arrows move and wrap, Home/End jump. Returns null for keys it ignores.
 */
export function nextIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** A swipe-down that should dismiss a sheet: far enough, or a quick flick. */
export function shouldDismiss(dy: number, ms: number): boolean {
  if (dy <= 0) return false;
  return dy > 120 || (dy > 48 && dy / Math.max(ms, 1) > 0.6);
}

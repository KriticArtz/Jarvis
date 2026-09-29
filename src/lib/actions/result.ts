export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
}

export const initialActionResult: ActionResult = { ok: false };

export const NOT_SIGNED_IN: ActionResult = { ok: false, error: "Your session has expired. Please log in again." };
export const GENERIC_ERROR: ActionResult = { ok: false, error: "Something went wrong saving that. Please try again." };

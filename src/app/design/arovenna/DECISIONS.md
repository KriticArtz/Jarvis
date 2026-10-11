# Arovenna rebrand — recorded decisions

Status: preview only (`/design/arovenna`). The wider rebrand has **not** started.
Branch `arovenna-rebrand`, local only, based on Production `50e48f9`.
Money stays isolated on `money-preview` at `00dc373` (on hold).

## 1. Default assistant name
- New users who haven't customized their assistant's name: **Arovenna**.
- Any name an existing user explicitly chose is preserved (it's stored on
  their profile; only the fallback for an unset name changes).
- The assistant name stays configurable (Settings → Your AI).

## 2. Theme
- **Arovenna** becomes the default for new users and for users whose theme
  preference is unset.
- Explicit saved selections — including **Ocean** — are preserved.
- No silent migration of saved preferences.
- Note for implementation: today an unset theme resolves to "ocean". Arovenna
  must become the fallback for *unset only*, without changing what an
  explicit "ocean" selection looks like. Adding a stored "arovenna" value would
  need a database check-constraint change, so the unset fallback is handled in
  code and no schema change is planned.

## 3. External brand changes — deferred to a separate launch phase
Not part of this work:
- Twilio registration (SMS consent and help texts are carrier-registered)
- Google OAuth consent-screen branding
- Supabase auth email templates
- Sender addresses
- Mobile app name, scheme and bundle identifiers
- Domain routing (arovenna.com) and authentication changes

During this work, do not change credentials, environment variables, OAuth
callbacks, account ownership or recovery settings.

Because SMS consent and help texts read the brand name, they must keep saying
"Jarvis" until the Twilio registration is updated in the launch phase. The
in-app rename must not reach those texts before then.

## 4. Logo
- Use only the supplied, original Arovenna logo. Do not create, redraw or
  substitute a logo.
- Received: `arovenna-logo-reference.webp` (1254×1254, byte-identical to the
  supplied file). It is a finished app-icon composition: gold A emblem and
  AROVENNA wordmark on a rounded forest-green tile with its own lighting.
- In the preview it is only cropped for display:
  - the seal face is a circular crop around the A (whole emblem, base included);
  - the header wordmark is a crop of the supplied wordmark, shown on the dark
    hero only.
- Before production: a transparent, production-ready asset is needed for
  ivory backgrounds, light navigation, favicons and social images. Ask the
  owner for the format before recreating or vectorizing anything.

## 5. Design direction — approved (direction only)
Approved: deep forest + champagne gold, warm ivory light mode, editorial
typography, the restrained Today dashboard, and the dark-hero /
light-conversion landing composition. This approval covers the direction,
not the full rebrand; production components are not to be modified yet.

## 6. Seal behaviour (rules for implementation)
- Idle is completely still: no idle loop and no hover effect.
- Motion is state-specific and restrained; reduced motion removes all of it,
  and every state stays distinguishable without motion.
- The seal shows real assistant state only, from the same signals the live
  Presence uses today (`src/components/assistant/chat.tsx`): listening while
  the user types to the assistant, thinking while a reply streams, acting
  while an action runs, complete once when it finishes, then idle.
- Never fake activity. Note: the live nav shows the Presence as "listening"
  whenever the Assistant tab is open (`src/components/app/nav.tsx`). The seal
  must not copy this; in navigation it stays idle, and the active tab is
  shown by the normal selected style.
- The landing hero seal is still; there is no autoplaying demo.

## 7. Today
Re-skin only. Keep the live screen's blocks and order (date + Plan my day,
greeting, the day as one line with a "now" marker, the recommendation,
Later + add a task, Momentum). Add no new elements or decoration.

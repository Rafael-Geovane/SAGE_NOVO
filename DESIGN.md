---
version: alpha
colors:
  primary: "#096CA8"
  ink: "#142536"
  surface: "#FFFFFF"
  ice: "#EAF4FA"
  muted: "#526475"
  warning: "#9A5700"
typography:
  display:
    fontFamily: "Segoe UI, sans-serif"
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: "1.65"
  data:
    fontFamily: "ui-monospace, monospace"
rounded:
  panel: "16px"
  control: "8px"
spacing:
  base: "4px"
  panel: "24px"
components:
  button:
    height: "48px"
    rounded: "8px"
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
  field:
    height: "46px"
    rounded: "8px"
    textColor: "{colors.ink}"
  panel:
    backgroundColor: "{colors.surface}"
  process-section:
    backgroundColor: "{colors.ice}"
  caption:
    textColor: "{colors.muted}"
  warning:
    textColor: "{colors.warning}"
---

# SAGE design context

Product explorer (16/11/2026): public `/modelo` preserves SAGE blue/graphite
and uses on-demand Three.js geometry. External and exploded views have native
buttons, keyboard camera controls and an accessible component list. Only the
confirmed academic prototype parts are represented; sensors, positions and
enclosure are conceptual. Clearly labeled 2D reference images provide fallback
when WebGL or the lazy 3D module fails. No automatic continuous animation.

Workspace update (10/11/2026): authenticated routes share a blue/graphite sidebar
with a horizontally scrollable navigation on mobile. Weekly reports group
physical and simulated sources separately. Plan prices and Premium analysis
are explicitly demonstrative for the TCC; there is no payment or external AI
provider. Keep the hidden test route out of navigation. Native browser print
exports reports without navigation controls.

## Product and audience

Brazilian Portuguese; family/caregiver monitoring and SAGE administrators. Academic ESP32 wearable prototype. Accessible, calm reading with no invented telemetry or commercial claims.

## Visual direction

Blue and graphite recovered from the MVP, white reading surfaces, product reference photography and a clear, quiet instrument-panel language. The vest is the signature, never decorative medical graphs.

## Tokens and ownership

Runtime owner: `src/styles/tokens.css`. Ink #142536, blue #096CA8, ice #EAF4FA, paper #FFFFFF, muted #526475, warning #9A5700. Display Segoe UI; body system-ui; data ui-monospace. Radius 16px; spacing uses multiples of 4px. No external font requests. Shared styles live in `src/styles/app.css`; shared controls in `src/components/ui`.

## Interaction

Native select owns OS popup geometry. Radix Dialog owns modal focus, Escape and restoration. Status/feedback uses inline shared State components; no browser dialogs. Forms validate on submit, focus the first invalid field and preserve input. Pagination 25 rows; sensitive state never in URL. Dates pt-BR in the browser timezone with visible timezone context.

## Responsive and accessibility

360px baseline; tables own horizontal overflow, documents own vertical scrolling. Focus visible, 44px controls, native semantics, reduced motion, readable contrast and no color-only status. All scrollable surfaces inherit global scrollbar tokens and forced-colors fallback.

## Asset integrity

Existing color images are illustrative and include other brand labels/unverified features. Always caption as prototype references; colors describe image appearance, not commercial availability. No claims inferred from embedded text.

## Verification

Backend integration (19/10/2026): keep the current visual system and inline feedback. Technical reception states are missing data, recent, stale and offline; freshness and live transport are independent. History, alert queries and caches follow the current vest assignment as well as the person. Reassignment requires a new explicit caregiver grant. Technical windows are configurable and do not imply clinical monitoring or guaranteed delivery.

Typecheck, Vitest, production build, formatter, premium static audit when Python runtime is available, plus browser desktop/mobile flow checks. Backend checks require configured Supabase; never describe those as executed without evidence.

Backend consistency (26/10/2026): existing controls and visual tokens are unchanged.
Private caches are canceled/removed on scope changes, history pagination resets
before requesting a new assignment, and buffered live inserts survive delayed
HTTP responses. App-owned auth storage fences local logout against stale writes;
explicit sign-in and recovery callbacks remain supported. These guarantees do
not imply remote session revocation or hardware delivery.

Local vest test (29/10/2026): `/teste-colete` is an explicitly synthetic, public
test surface independent of real patient/device records. Keep controls and data
labels compact, inherit shared buttons/native selects and tokens, use a warm
test-provenance label and green technical status alongside the existing blue.
Scope-specific repeated metric tiles use 8px radius. Its graph represents the
actual generated samples, including missing-data gaps; never imply diagnosis.

Care profile and site notifications (30/10/2026): reuse the canonical modal,
Field/TextAreaField, Button and State. The administrator's code entry continues
to the care profile, also editable in the dashboard; caregivers retain activation
proof and authorized read access. Health data stays out of URLs/local storage and
notification previews. Unknown allergies remain unknown. A global authenticated
bell counts pending possible-fall reports; human review is explicit and audited.
The simulator's review controls remain local and clearly synthetic. Tables own
horizontal scrolling; fall actions have a readable minimum column width.

How it works (30/10/2026): public /como-funciona uses the current brand tokens,
conceptual vest asset and canonical buttons/FAQ disclosures. The information
path and ordered onboarding steps explain the actual product. Header, footer
and the home introduction link to the same route. Keep activation authorization,
unknown readings, human fall review and the site-open notification limit explicit.

Managed vest (30/10/2026): the account navigation uses the canonical ConnectDevice
code dialog, with no fixed test-device shortcut. A delegated profile manager can
complete/edit only the current assignment of an explicitly granted vest; other
caregiver links retain activation proof. SGE-067 uses the normal device/profile
layout, with a visible simulated-data provenance note before its metrics and in
history. Random generation is server-authorized, pauses on hidden/unmounted
pages and has an explicit pause/resume control. Never imply a physical measurement.

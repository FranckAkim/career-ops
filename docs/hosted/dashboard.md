# Dashboard implementation

The approved product concept is being implemented on the existing hosted application. The engine remains pinned to the independently verified local AI revision `73e7202deeccce325e5f3b337d9840987ddfc9dd`.

## Implemented foundation

- Navy sidebar, responsive Overview, Opportunities, CV Studio, My Profile and Settings views.
- Search over the authorized recent job history, live summary counts, progress columns and recent activity.
- Only successful, published PDF results appear as ready CVs. CV metadata is associated with its source evaluation from the same authorized history.
- Existing evaluation, progress, report/PDF download, cancellation and explicit recovery controls remain in Opportunities.
- CV library uses the existing authenticated download endpoint. Confirmed profile is read through owner-authorized onboarding APIs; it is not editable in this phase.
- Settings and footer disclose local operator inference and hosted storage. The interface does not claim the local worker is online without a heartbeat.
- Counts describe the latest 100 jobs. No fabricated applications, interviews, notifications or saved roles are shown.

## Validation

The production Next build/type checks, source/dependency boundary checks, projection tests and real disposable-Postgres/container/browser integration pass locally. Browser checks include onboarding, navigation, search, CV library, owner profile, real engine PDF rendering, download integrity, reload/mobile width, cancellation, recovery and tenant/session denial. These container fixtures use a local mock model; the pinned engine's real local-model evidence is recorded separately in `live-activation.md`.

## Next product work

Application stages must use a new allowlisted engine operation calling canonical `set-status.mjs`, then publish a fenced workspace generation. Derive the displayed application state from the committed tracker; do not write a second frontend/SQL-only tracker. Test tenant authorization, stale evaluation IDs, retries, cancellation, receipt integrity and engine parity before showing Applied/Interview controls.

Confirmed-profile editing requires an explicit review/confirmation and versioned source publication, with stale evaluations rejected. Retention/deletion and broader beta access remain separate work; do not present them as implemented.

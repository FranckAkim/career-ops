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

## Live evidence

Frontend source `42faebe5e9aa2afd42f055d432fdf1e2f82aba20` reached READY in deployment `dpl_Eg2ZdVKTP48nBWNXH3X1ksQiKiJ3`. Production browser checks pass using only a temporary synthetic owner session: counts/search, CV library download with committed hash, confirmed profile, settings, keyboard navigation, reload, all five mobile navigation controls, no horizontal overflow, cross-tenant history 404, anonymous 401 and revoked-session 401. Test auth records were removed; no new model job or real user session was changed. Final desktop/mobile screenshots are in task outputs.

The local worker was found stopped from an unhandled checked-out database-client error. Client and pool error observation now prevent that process crash. Real Neon driver fault injection proved the failed query rejects and a fresh connection handles the next SELECT. The on-demand Windows task is running again with at most three restart-on-failure attempts, one minute apart. It still has no sign-in trigger and does not silently retry interrupted model jobs.

Final source `e86dda881e7f41d18a088756fdd94efe31e4c7ec` passed both Windows and Linux jobs in [CI run 44870843583](https://github.com/FranckAkim/career-ops/actions/runs/44870843583). Frontend deployment `dpl_8RcY56Y8VpFai76v7uCRm6pjKBEm` reached READY with the same dashboard code and the worker connection fix. The operator task remained running after the reconnect check.

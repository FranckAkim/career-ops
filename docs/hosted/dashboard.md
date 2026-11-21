# Dashboard implementation

The approved dashboard and canonical application tracking are live. The current engine is pinned to `1b2d1b72da7b5665d33da7ec1f71e4bd7ba9a4a6`; the local worker retains the prior reviewed revision for rolling compatibility. See `application-tracking.md` for current evidence.

## Implemented foundation

- Navy sidebar, responsive Overview, Opportunities, CV Studio, My Profile and Settings views.
- Search over the authorized recent job history, live summary counts, progress columns and recent activity.
- Only successful, published PDF results appear as ready CVs. CV metadata is associated with its source evaluation from the same authorized history.
- Existing evaluation, progress, report/PDF download, cancellation and explicit recovery controls remain in Opportunities.
- CV library uses the existing authenticated download endpoint. My Profile supports reviewed, confirmed source edits with versioned publication; see `profile-editing.md`.
- Settings and footer disclose local operator inference and hosted storage. The interface does not claim the local worker is online without a heartbeat.
- Counts describe the latest 100 jobs. No fabricated applications, interviews, notifications or saved roles are shown.

## Validation

The production Next build/type checks, source/dependency boundary checks, projection tests and real disposable-Postgres/container/browser integration pass locally. Browser checks include onboarding, navigation, search, CV library, owner profile, real engine PDF rendering, download integrity, reload/mobile width, cancellation, recovery and tenant/session denial. These container fixtures use a local mock model; the pinned engine's real local-model evidence is recorded separately in `live-activation.md`.

## Next product work

Application tracking now uses canonical `set-status.mjs` through queued, fenced publication and a committed-generation projection. Applied/Interview controls are live and verified; see `application-tracking.md`.

Confirmed-profile editing is live with explicit review/confirmation, versioned publication and stale-evaluation rejection. Read `profile-editing.md` for current evidence. Retention/deletion and broader beta access remain separate work; do not present them as implemented.

## Live evidence

Frontend source `42faebe5e9aa2afd42f055d432fdf1e2f82aba20` reached READY in deployment `dpl_Eg2ZdVKTP48nBWNXH3X1ksQiKiJ3`. Production browser checks pass using only a temporary synthetic owner session: counts/search, CV library download with committed hash, confirmed profile, settings, keyboard navigation, reload, all five mobile navigation controls, no horizontal overflow, cross-tenant history 404, anonymous 401 and revoked-session 401. Test auth records were removed; no new model job or real user session was changed. Final desktop/mobile screenshots are in task outputs.

The local worker was found stopped from an unhandled checked-out database-client error. Client and pool error observation now prevent that process crash. Real Neon driver fault injection proved the failed query rejects and a fresh connection handles the next SELECT. The on-demand Windows task is running again with at most three restart-on-failure attempts, one minute apart. It still has no sign-in trigger and does not silently retry interrupted model jobs.

Final source `e86dda881e7f41d18a088756fdd94efe31e4c7ec` passed both Windows and Linux jobs in [CI run 44870843583](https://github.com/FranckAkim/career-ops/actions/runs/44870843583). Frontend deployment `dpl_8RcY56Y8VpFai76v7uCRm6pjKBEm` reached READY with the same dashboard code and the worker connection fix. The operator task remained running after the reconnect check.

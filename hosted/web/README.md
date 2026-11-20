# Career Workspace deployment entry

Use **`hosted/web` as the Vercel project Root Directory**. This is a native Next.js
16.4.6 app targeting Node 24.x (tested with 24.15.0). Do not deploy the repository
root or the legacy `web/` app. The `career-workspace` project now exists in the
user's `franck-the-tank` Vercel team. Node 24, Next.js, the hosted root, shared
sources and build commands were configured through the connected Vercel API.
Git, environment variables and service resources remain unconfigured; there is
no deployment. Local `.vercel/` linkage is private and ignored.

The hosted UI and APIs remain authored in `../../web/src/`. Preparation copies
only the listed hosted screens, API handlers, server boundary and vendored Inter
font/license. Generated copies are ignored and checksum-verified during builds;
edit the original source, not the copies. This app's layout and hosted-only mode
are independent of the legacy local dashboard. No local mode can be enabled.

```
npm ci --prefix hosted/web --ignore-scripts --no-audit --no-fund
npm --prefix hosted/web test
npm --prefix hosted/web run build
```

The build runs source preparation, Next's production build/typecheck, then a
route/dependency audit. It fails on unexpected source/public assets or links,
changed generated files, extra routes, worker/engine/operator dependencies,
personal workspace files, dotenv files or external source/data traces. Only
ancestor `package.json` metadata may be traced outside this project. Conservative
traces of unused shared-package worker/operator modules are explicitly excluded;
the audit independently checks they are absent. Do not remove the audit to make
a larger bundle pass. The font's OFL is served at `/fonts/Inter-OFL.txt`.

The production route set is `/`, `/hosted`, `/api/auth/*`, `/api/hosted/*` and
framework error/static assets. Root redirects to `/hosted`. Local command/file
routes do not exist in this build. The source guard also rejects unexpected
public files. Common security headers must not override the download handler's
stricter CSP; browser tests verify this through an actual PDF response.

## Vercel project setup

| Setting | Value |
| --- | --- |
| Repository | User fork `FranckAkim/career-ops` |
| Production branch | `product/hosted-foundation` until explicitly changed |
| Framework | Next.js |
| Root Directory | `hosted/web` |
| Include source files outside Root Directory | Enabled, for shared source/local dependency |
| Skip unaffected projects | Disabled until shared-source change detection is verified |
| Install/build | Pinned in `vercel.json`; use this project's lockfile |
| Output | Next.js default `.next` |
| Runtime | Node 24.x; database/runtime settings configured separately |

Do not add a second score/parser implementation or copy the whole legacy tree.
Future hosted modules must be explicitly added to preparation/audit policy.
`DATABASE_URL`, stable `BETTER_AUTH_URL`, auth secret, Google OAuth settings,
`HOSTED_ENGINE_REVISION` and private Blob configuration follow
[`docs/hosted/auth-api.md`](../../docs/hosted/auth-api.md). Secrets stay server-only.
Apply migrations with the existing explicit operator command/migration role, not
as part of this build or an HTTP request. Link and verify the Vercel environment
before live-resource migrations or runtime testing.

CI runs the real PostgreSQL/browser/worker/PDF tests against this app using
`HOSTED_TEST_APP=deployment`, including an intentionally requested local mode.
The browser flow verifies the shared implementation still works while legacy
routes remain absent. Local build traces currently include 1211 unique files,
about 7.3 MB before Vercel's packaging; that is not a billed/deployed bundle-size
measurement. Vercel's actual deployment artifact still needs inspection once
the project is linked. No cloud compatibility claim is made from local builds.

The worker remains a separate trust/deployment boundary. See
[`docs/hosted/sandbox-worker-plan.md`](../../docs/hosted/sandbox-worker-plan.md).
Live OAuth/Blob/database configuration, quotas, retention and an authorized
model budget remain required before beta.

Vercel reference: [shared monorepo sources](https://vercel.com/docs/monorepos/monorepo-faq).

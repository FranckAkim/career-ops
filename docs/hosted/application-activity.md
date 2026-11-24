# Submission and recruiter response tracking

Save a search result or import a Handshake posting, then open **Applications → Submission & response tracking**. The same log is available on the saved job in Opportunities. No evaluation is required.

1. Choose **Application submitted**, enter the actual date, and optionally select a confirmation email or screenshot. Selecting a file does not save it.
2. Confirm that you already submitted the application yourself, then choose **Mark as applied**. The log shows a user-confirmed submission and whether any recruiter response has been recorded.
3. Record automated acknowledgments separately from recruiter responses. Interview invitations, rejections, offers and withdrawals have their own event types. Add a contact and notes as needed.
4. Set a next action and follow-up date in **Review state & follow-up plan**. Dates are shown on the Applications card; this does not send reminders or messages.

The dated timeline and supporting file persist after reload and search expiry. Records are user-confirmed observations, not independently verified submissions. An acknowledgment does not count as a recruiter response. Mailbox access and automatic email detection are not connected in this release.

Canonical application stages remain in the engine's Markdown tracker. Existing status controls update those stages through the constrained worker. Recording an activity never submits an application, runs AI, or silently changes a canonical stage. This keeps manual evidence tracking usable even while the local worker is offline.

## Private evidence and corrections

Allowed files are PNG/JPG screenshots, PDF, TXT and EML, at most 512,000 bytes (500 KB). The server validates type signatures or UTF-8 text, names and base64 encoding. It never renders or executes the file. Authenticated, owner-scoped downloads use attachment disposition, no sniffing and private/no-store caching.

Files are stored inline as base64 in bounded private Neon records, not public Blob URLs. Normal lists expose file metadata without file content. There are at most 20 events per saved job, a 900 KB encoded activity limit per job, and approximately 2 MB across the account's saved activity. This is intended for small confirmations; larger documents must be reduced before upload.

Event removal requires a second confirmation and removes its attached file. Removing a saved job removes its entire activity log and evidence; evaluations and canonical tracker entries remain. Personal data export includes full evidence bytes in base64, name and MIME metadata. Reviewed account deletion removes the saved row and its evidence. Nothing is sent to job sources, an AI provider or a recruiter.

## Implementation and verification

Migration 025 adds `saved_jobs.activity`; the existing lifecycle guard increments the saved-job revision on mutation. Account deletion scopes already include that revision. Tenant-row serialization, owner checks, compare-and-swap revisions, explicit confirmation and replay IDs protect mutations. Web has update permission on the new column; discovery and AI worker roles have no saved-job reads. Export is explicitly bounded.

Unit tests cover event/date/file validation. Disposable PostgreSQL tests cover private byte round trips, redacted lists, cross-owner/CSRF/replay/stale/size/quota denials, correction, export and deletion. The browser journey covers submission, acknowledgment versus response, persistence, download, follow-up, removal and mobile layout while asserting no AI or stage jobs are created. Production release evidence is recorded in PROJECT_HANDOFF.md.

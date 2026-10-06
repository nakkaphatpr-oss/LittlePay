# LittlePay Firestore

Production uses project `littlepay-b16d6`, Standard Firestore `(default)` in `asia-southeast1`. The website remains on Vercel and retains private-link access. Google Sheets is the pre-migration archive, not a live mirror after cutover.

## Server configuration

Set `LEDGER_BACKEND=firestore`, `FIREBASE_PROJECT_ID`, and sensitive production-only `FIREBASE_SERVICE_ACCOUNT_JSON` in Vercel. Keep `ACCESS_KEY_HASH`. Never put service account credentials in Git, the browser, screenshots, or logs. The local credential filename `firebase-service-account.local.json` is ignored.

Public Firestore rules deny all client access (`allow read, write: if false`). Vercel verifies the private key before calling the Admin SDK. Vercel functions run in Singapore (`sin1`). Server credentials use IAM privileges, not client rules.

## Storage and consistency

`littlepayBooks/main` stores revision, settings, and the latest 100 history entries as JSON. Its `chunks` subcollection stores groups of up to 100 records, including separate trash groups. This avoids loading one Firestore document per transaction. Each chunk must remain below Firestore's document-size limit; current validated transaction bounds and groups of 100 keep normal chunks comfortably below it.

An atomic Firestore transaction reads the metadata and chunks, checks revision, updates changed chunks and metadata, and creates an operation receipt. Receipts contain a SHA-256 fingerprint of the canonical command and persist to prevent duplicate writes after lost responses. Reuse of an operation ID with different contents is rejected. Prior Google Sheets events remain in the original Sheet; stale commands from before migration are rejected by the preserved revision.

The browser opens its last cached ledger immediately only when this device already has a remembered key. It labels cached data while fetching the current version, and disables editing during that refresh. This does not guarantee server responses below one second. No polling or inactivity logout is introduced.

## Migration and rollback

Deploy with `LEDGER_READ_ONLY=true` while still on Sheets. Verify the public API reports readOnly, wait beyond the old function's 60-second runtime, then run `node scripts/migrate-firestore.mjs --confirmed-maintenance`. It saves a private local backup, creates the Firestore ledger only if absent, compares all records/settings/history, account balances and totals, and re-reads Sheets to detect changes. It refuses to overwrite an existing target.

Only after successful verification, deploy `LEDGER_BACKEND=firestore` and `LEDGER_READ_ONLY=false`. Keep the Sheet and private backup. Once users write to Firestore, switching back to Sheets alone would lose those new changes: freeze writes and reconcile/export the latest Firestore data first. Do not use old Vercel deployment URLs as a second active ledger.

Backups remain available through the app's JSON export. Paid Firebase scheduled backups are not enabled. Monitor storage, reads/writes, and operation-receipt growth; no provider's future free quota is guaranteed.

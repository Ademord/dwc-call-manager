# Local synthetic engine and API

This implementation is a working synthetic prototype. It uses the shared TypeScript application service and domain code for both the portable in-memory demo and the local Fastify service. The service stores synthetic data durably in SQLite. It does not implement a production deployment, real identity, telephone provider integration, or the proposed normalized PostgreSQL schema.

## Run and persistence

Use Node 24.16 or newer and the root lockfile. The local API entry is `src/server/start.ts`; `npm run dev:api` and `npm start` should run `tsx src/server/start.ts`. The default address is `http://127.0.0.1:4318`. The service always binds to `127.0.0.1`; `PORT` changes only its port. Vite development uses port 4317 and proxies `/api` to 4318. After a frontend build, the same service serves `dist/index.html` and its assets.

The database defaults to `work/local-prototype.sqlite`. Set `DWC_DB_PATH` to use another explicit location. The first run initializes the fixture; subsequent runs load the existing state. Acknowledged drafts, submitted revisions, assignment audit entries, canonical event identities and command receipts survive a process restart. Failed transactions roll back the entire state. Reset replaces only the synthetic prototype state, invalidates report snapshots and returns synthetic sessions to the agent role.

The SQLite repository uses one schema-versioned JSON document in a transaction with `BEGIN IMMEDIATE`, WAL and `synchronous=FULL`. This keeps a command, its version/revision changes and its idempotency receipt atomic. It deliberately trades normalized SQL constraints, independent queries and large-volume performance for a small runnable prototype. The service is intended for one local API process. It does not constitute a migration of `contracts/schema.sql` or evidence that a PostgreSQL adapter works. Corrupt or unsupported state fails startup; it is not silently reset.

## Backup and restore

The `backup:local` script runs `tsx src/server/backup.ts`. Example: `npm run backup:local -- work/backups/synthetic.sqlite`. It uses SQLite's online backup API, producing a consistent database while the local service is running. The destination must be new; the command refuses to overwrite an existing file. To inspect a restored copy, stop the running service, set `DWC_DB_PATH` to the backup path, and start the service. This avoids replacing an existing database and its WAL files. Test evidence covers backup creation and opening that backup with identical stored state; operational backup scheduling is not implemented.

## Identity and local boundary

The `/api/demo/actor` route intentionally switches between fixture agent and manager identities. These are synthetic roles, not authentication. A server-side session stores the selected actor; browser headers and call bodies cannot choose a trusted actor on business routes. Sessions use an opaque HttpOnly SameSite=Strict cookie, expire after eight hours and are capped at 100 in the process. Switching synthetic roles rotates the session. The application enforces agent call ownership and manager-only reporting, export and assignment on every operation, including receipt replay.

The API validates loopback Host values, rejects unexpected Origin values, accepts no cross-origin CORS policy and requires `X-DWC-Local: 1` on mutations. The default frontend/API localhost origins are allowed. These are local prototype safeguards. There is no OIDC, password login, real subject provisioning, production CSRF implementation, TLS termination or remote deployment. Do not describe this build as production authentication or expose it on a public network.

## Shared behavior

Evaluation validation accepts only the catalog v1 fields and codes. Non-DWC reasons require null DWC fields. A DWC submission requires device, fault and resolution; explicit unknown codes are valid answers. Drafts may be incomplete and never change reports. Submission creates a new immutable history entry and clears the draft. Assignment to an active agent audits the transition, discards any draft and keeps the current submission.

Mutations require an expected `recordVersion` and UUID idempotency key. Identical retries return the original committed response, including its original version. A replay must be followed by a fresh call read before another edit. A different payload/path/version under the same actor/key returns 409; a new stale command returns 412 without writes. The UI must retain the entire submitted envelope on an uncertain response. The optional fault adapter affects the next submission only: `before` rejects before calling the application; `after` commits through the application and simulates losing the response. The retry uses the same body, key and expected version.

Synthetic event replay uses the application ingestion method and original final event evidence. A different delivery ID with identical canonical facts does not multiply calls. Conflicting final facts are rejected without changing the original. An unhandled event is excluded from product calls; a handled unmapped event is counted and unassigned. This internal synthetic port does not expose a native provider webhook, reconciliation UI, operational quarantine store, or provider completeness claim. The replay/new-call routes can generate only the supplied synthetic events, not arbitrary browser-supplied provider envelopes.

## Reporting and export

Both compositions use the same reducer. Membership and daily buckets use the configured reporting-local end date, preserving the independent local-midnight semantics across 23- and 25-hour DST days. All main reason shares include pending and use all eligible ended calls. DWC breakdowns use evaluated DWC calls. The reducer zero-fills every calendar date. Empty denominators return null percentages, and the response includes the fixture time, timezone and partial-period flag. The synthetic application clock is fixed at `2026-09-05T10:00:00Z` for repeatable fixtures; report snapshot expiry uses actual elapsed wall time.

Each report creates an immutable CSV snapshot bound to the actor and session, valid for five minutes. The process cache retains at most five snapshots per session and 100 MiB across sessions; oldest snapshots are evicted. Expired, evicted, lost or wrong-session tokens return 410 with an explicit dashboard refresh requirement. Export rechecks manager scope. Reset/process restart invalidates cached snapshots. CSV is UTF-8 with a BOM, semicolon delimiter, quoted/escaped cells and neutralized formula prefixes. It includes pending rows with blank classification cells, opaque call IDs, German labels, local end time, agent display name, current revision and report date/timezone metadata. It excludes provider identifiers and caller numbers. HTTP export also sends selection/timezone/generation metadata headers.

## Explicit prototype bounds and contract differences

- 10,000 calls, 20,000 successful command receipts and 30,000 recorded synthetic event deliveries. Reaching a write bound rejects the command; receipts are never silently evicted. Reset starts a fresh synthetic dataset. No retention policy or long-running live use is implied.
- Reports cover at most 366 calendar dates. Call listing returns the entire bounded authorized list. The OpenAPI keyset pagination contract is not implemented; the local endpoint rejects query filters it does not support.
- Active-agent listing is a small fixture directory, not a paginated production directory. The supplied fixture has one active agent. Assignment enforcement supports another active synthetic agent when such a fixture is used.
- No HTTP webhook, real provider, real service ticket, offline outbox, import workflow, catalog editor, real authentication, audit retention, PostgreSQL migration, load test or multi-instance snapshot sharing.
- SQLite uses one JSON state document; reports are computed from one in-process state read. Report caches and synthetic sessions are ephemeral. The prototype's shape is documented by TypeScript and these routes; it is not presented as full conformance to the original production OpenAPI.

## Executed checks

`tsx --test tests/engine/*.test.ts` passed 16 tests on Node 24.16.0. The checks exercise the independent fixture oracle before/after guided submission, correction drafts, validation rollback, idempotent replay and key reuse, expected-version contention, response-loss retry, reassignment access revocation, synthetic ingestion replay/exclusion/unmapped handling, report cache expiry/session bounds, CSV injection protection, Zurich spring/fall DST boundaries, SQLite restart/rollback/backup restore and direct HTTP authorization/preconditions/origin/host checks. TypeScript strict checking of the engine/API/tests also passes. These checks do not replace the browser/UI acceptance evidence recorded separately by the UI work.

# Architecture

## Two runnable compositions

| Composition | Entry point | Storage | Intended use |
| --- | --- | --- | --- |
| Portable demo / GitHub Pages | `src/demo.tsx` | Browser memory | Share and explore synthetic workflows; reload resets it |
| Local prototype | `src/main.tsx` + `src/server/start.ts` | SQLite through one local API process | Exercise durable synthetic drafts, revisions, retries, and backup |

The React interface talks to a client interface. Its memory adapter calls the same application service that the Fastify API uses. The application service owns commands, version checks, idempotency receipts, assignments, and report snapshots. The domain layer owns the catalog, validation, reporting reducer, and CSV formatting.

## Source map

- `src/ui`: workspace, evaluation dialog, manager reports, help hints, and guided tours.
- `src/client`: shared interface, HTTP adapter, and portable memory adapter.
- `src/application`: application service and repository boundary.
- `src/domain`: types, catalog, validation, reporting, and CSV.
- `src/server`: local HTTP service, SQLite adapter, and backup command.
- `demo`: deterministic seed, independent expected results, and portable HTML output.
- `tests`: engine/API integration checks and Playwright browser checks.

## Data behavior

A draft does not change reporting. A successful submission creates a revision, clears the draft, and returns the committed result. Corrections preserve earlier revisions. Commands carry an expected record version and an idempotency key; an identical retry returns the original receipt. An uncertain response keeps the original command envelope until its outcome is resolved.

Reports use Europe/Zurich calendar dates. Pending calls remain visible in counts and denominators. CSV exports use an immutable, session-bound snapshot with a five-minute lifetime, rather than re-querying a potentially changed report. The fixed fixture clock makes demo results reproducible; snapshot expiry uses elapsed wall time.

SQLite currently persists a schema-versioned JSON state document atomically. WAL and full synchronization support the local durability checks, but this is not a normalized database or a validated large-volume design. See [Local engine and API](LOCAL-ENGINE.md) for the exact bounds and failure behavior.

## Contracts and future implementation

The files in `contracts/` are **design artifacts for a future integrated service**. The PostgreSQL schema and OpenAPI document are not installed or fully implemented by the local prototype. In particular, production identity, provider webhooks, reconciliation, pagination, and multi-instance deployment remain future work. Current runnable behavior is documented in TypeScript, tests, and [LOCAL-ENGINE.md](LOCAL-ENGINE.md).

## Deployment

The release build creates both compositions. After local engine and browser checks pass, only the contents of `demo/dist/` are published on the `gh-pages` branch. GitHub Pages serves that standalone `index.html` and its build metadata. The API and SQLite database are never deployed to Pages.

A ready-to-enable [Actions template](ci-workflow.yml.example) can automate checks and deployment when the maintainer has workflow permissions. It is currently a template, not an active CI check. See [Contributing](../CONTRIBUTING.md) for the publishing steps.

The local API always binds to `127.0.0.1`. Its synthetic role switch is not login. A supported internal pilot needs real identity, access control, ownership, backup/restore procedures, and operational agreement before taking real calls. The [roadmap](../TODO.md) separates these requirements from the demo features already implemented.

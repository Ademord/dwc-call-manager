# Roadmap

## Available in prototype 0.2

- [x] Four call reasons and conditional device/fault/resolution questions.
- [x] Synthetic agent workspace, drafts, saved summaries, and revision history.
- [x] Retry handling for failures before storage and lost responses after storage.
- [x] Manager dashboard, local date filters, pending counts, and snapshot CSV export.
- [x] Portable offline demo and durable local SQLite composition.
- [x] Guided call tour with spotlight, dimmed background, pause/resume, speed control, and keyboard support.
- [x] Hover/focus/tap help and a user-paced report/filter/export walkthrough.
- [x] Public README screenshots, test commands, and a static GitHub Pages demo.
- [x] Active GitHub Actions checks for formatting, build, generated-demo freshness, 16 engine/API tests, and 26 browser tests, with Pages deployment after successful `main` checks.

## Before a supported internal pilot

- [ ] Confirm the call-volume denominator: yearly versus monthly, relevant products, handled versus offered calls, agent count, and peak concurrency. Do not infer call demand from installed product counts.
- [ ] Compare 150,000 calls/year and 150,000 calls/month as separate sizing scenarios. Measure actual bytes per record/revision, indexes, backup copies, retention, and report latency before choosing storage.
- [ ] Evaluate a single internal service and normalized database against per-device storage with an explicit sync protocol. Compare ownership, offline requirements, backup/restore, conflicts, deployment permissions, and support cost.
- [ ] Name a service owner and establish the approved hosting location, real identity, role mapping, access controls, retention, and recovery procedure.
- [ ] Validate telephony event contracts, deduplication, agent mapping, and reconciliation with the actual provider.
- [ ] Design and test a durable offline outbox only if measured connectivity needs justify it. Synchronizing live database files is not a substitute for an application sync design.
- [ ] Implement and measure a normalized persistence adapter and pagination. Test realistic write contention, reporting periods, restore time, and long-running retention.
- [ ] Define release/rollback procedures and monitoring before allowing real caller information.

## Further product work

- [ ] Validate the taxonomy and German wording with agents and managers.
- [ ] Test the tour with first-time users and assistive technology; measure where users pause, abandon, or need explanation using an explicitly agreed research process.
- [ ] Consider localization, catalog administration, richer reporting, and integration with a real service-ticket system after the core workflow is validated.

These are planned requirements, not claims that the public demo supports a company rollout or 150,000-call workloads.

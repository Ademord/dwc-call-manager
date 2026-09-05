import test from 'node:test';
import assert from 'node:assert/strict';
import seedJson from '../../demo/seed.json';
import expected from '../../demo/expected.json';
import { ApplicationService } from '../../src/application/service';
import { createState, MemoryRepository } from '../../src/application/repository';
import { AppError } from '../../src/domain/errors';
import { emptyEvaluation, changeReason } from '../../src/domain/catalog';
import { validateEvaluation } from '../../src/domain/validation';
import { createMemoryClient } from '../../src/client/memory';
import type { Context, EvaluationValue, Seed } from '../../src/domain/types';

const seed = seedJson as Seed;
const agent: Context = { actorId: seed.actors[0].id, sessionId: 'agent-session' };
const manager: Context = { actorId: seed.actors[1].id, sessionId: 'manager-session' };
const guided = seed.guidedCallId;
const key = () => crypto.randomUUID();
const reason = (value: EvaluationValue['reason']): EvaluationValue => ({
  ...emptyEvaluation(),
  reason: value,
});
function setup(clock?: () => number, data = seed) {
  const repository = new MemoryRepository(createState(data));
  return { repository, service: new ApplicationService(repository, data, clock) };
}
const status = (expectedStatus: number) => (error: unknown) =>
  error instanceof AppError && error.status === expectedStatus;
function oracle(
  report: ReturnType<ApplicationService['report']>,
  target: typeof expected.baseline,
) {
  for (const field of [
    'counts',
    'reasonDenominator',
    'reasonPercent',
    'dwcFaultDenominator',
    'dwcFaultCounts',
    'deviceCounts',
    'resolutionCounts',
  ] as const)
    assert.deepEqual(report[field], target[field], field);
}

test('fixture report and real guided command reconcile with independent oracle', () => {
  const { service } = setup();
  const baseline = service.report(manager, seed.reportRange.from, seed.reportRange.until);
  oracle(baseline, expected.baseline);
  assert.equal(baseline.daily.find((day) => day.date === '2026-09-05')?.total, 0);
  assert.equal(baseline.completionPercent, 83.3);
  assert.equal(baseline.periodIsPartial, true);
  service.replayCall(agent, guided);
  assert.equal(service.listCalls(agent).length, 12);
  service.submit(agent, guided, seed.guidedSubmission, 0, key());
  const after = service.report(manager, seed.reportRange.from, seed.reportRange.until);
  oracle(after, expected.afterGuidedSubmission);
  assert.equal(
    after.daily.reduce((sum, day) => sum + day.total, 0),
    after.counts.total,
  );
  assert.equal(
    after.counts.pending +
      after.counts.order +
      after.counts.invoice +
      after.counts.dwc_problem +
      after.counts.other,
    after.counts.total,
  );
});

test('drafts survive remount; correction drafts retain previous report classification', () => {
  const { service, repository } = setup();
  const saved = service.saveDraft(agent, guided, reason('dwc_problem'), 0, key());
  assert.equal(saved.recordVersion, 1);
  assert.equal(saved.evaluation, null);
  const remounted = new ApplicationService(repository, seed);
  assert.equal(remounted.getCall(agent, guided).draft?.value.reason, 'dwc_problem');
  assert.equal(
    remounted.report(manager, seed.reportRange.from, seed.reportRange.until).counts.pending,
    2,
  );
  const submitted = remounted.submit(agent, guided, seed.guidedSubmission, 1, key());
  const draft = remounted.saveDraft(
    agent,
    guided,
    reason('invoice'),
    submitted.recordVersion,
    key(),
  );
  assert.equal(draft.evaluation?.value.reason, 'dwc_problem');
  assert.equal(
    remounted.report(manager, seed.reportRange.from, seed.reportRange.until).counts.dwc_problem,
    3,
  );
  const corrected = remounted.submit(agent, guided, reason('invoice'), draft.recordVersion, key());
  assert.deepEqual(
    corrected.history.map((item) => item.value.reason),
    ['dwc_problem', 'invoice'],
  );
  assert.equal(corrected.evaluation?.revision, 2);
  assert.equal(corrected.draft, null);
  assert.equal(
    remounted.report(manager, seed.reportRange.from, seed.reportRange.until).counts.invoice,
    4,
  );
});

test('validation rejects hidden fields, unknown codes, missing DWC and unsupported catalogs without writes', () => {
  const { service, repository } = setup();
  const before = repository.read();
  const bad = [
    reason(null),
    reason('dwc_problem'),
    { ...reason('order'), fault: 'leak' },
    { ...seed.guidedSubmission, fault: 'invented' },
    { ...seed.guidedSubmission, catalogVersion: 2 },
    { ...reason('order'), actorId: manager.actorId },
  ];
  for (const value of bad)
    assert.throws(
      () => service.submit(agent, guided, value, 0, key()),
      (error) => error instanceof AppError && [400, 422].includes(error.status),
    );
  assert.deepEqual(repository.read(), before);
  const unknowns = {
    ...reason('dwc_problem'),
    device: 'unknown',
    fault: 'unknown',
    resolution: 'unknown',
  };
  assert.doesNotThrow(() => validateEvaluation(unknowns, true));
  assert.deepEqual(changeReason(seed.guidedSubmission, 'order'), reason('order'));
});

test('receipt replay returns exact original commit; changed key body and stale writers never overwrite', () => {
  const { service, repository } = setup();
  const commandKey = key();
  const first = service.submit(agent, guided, seed.guidedSubmission, 0, commandKey);
  service.saveDraft(agent, guided, reason('other'), first.recordVersion, key());
  assert.deepEqual(service.submit(agent, guided, seed.guidedSubmission, 0, commandKey), first);
  assert.equal(service.getCall(agent, guided).history.length, 1);
  const before = repository.read();
  assert.throws(() => service.submit(agent, guided, reason('invoice'), 0, commandKey), status(409));
  assert.throws(() => service.submit(agent, guided, reason('invoice'), 0, key()), status(412));
  assert.throws(
    () => service.submit(agent, seed.calls[11].id, reason('order'), 0, commandKey),
    status(409),
  );
  assert.deepEqual(repository.read(), before);
});

test('two concurrent expected-version writers permit exactly one commit', async () => {
  const client = createMemoryClient(seed);
  const results = await Promise.allSettled([
    client.submit(guided, reason('order'), 0, key()),
    client.submit(guided, reason('invoice'), 0, key()),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(
    (results.find((item) => item.status === 'rejected') as PromiseRejectedResult).reason.status,
    412,
  );
  assert.equal((await client.getCall(guided)).history.length, 1);
});

test('fault adapters distinguish no commit from lost response and retry creates one revision', async () => {
  for (const mode of ['before', 'after'] as const) {
    const client = createMemoryClient(seed),
      commandKey = key();
    client.setFault(mode);
    await assert.rejects(
      client.submit(guided, seed.guidedSubmission, 0, commandKey),
      status(mode === 'before' ? 503 : 504),
    );
    assert.equal((await client.getCall(guided)).history.length, mode === 'before' ? 0 : 1);
    const response = await client.submit(guided, seed.guidedSubmission, 0, commandKey);
    assert.equal(response.evaluation?.revision, 1);
    assert.equal((await client.getCall(guided)).history.length, 1);
  }
});

test('manager reassignment discards draft, preserves submission and revokes old owner including receipts', () => {
  const second = {
    id: '00000000-0000-4000-8000-000000001003',
    displayName: 'Second Agent',
    role: 'agent' as const,
    active: true,
  };
  const data = structuredClone(seed);
  data.actors.push(second);
  const { service, repository } = setup(undefined, data);
  const commandKey = key();
  const submitted = service.submit(agent, guided, seed.guidedSubmission, 0, commandKey);
  const draft = service.saveDraft(agent, guided, reason('invoice'), submitted.recordVersion, key());
  assert.throws(
    () => service.assign(agent, guided, second.id, draft.recordVersion, key()),
    status(403),
  );
  const assigned = service.assign(manager, guided, second.id, draft.recordVersion, key());
  assert.equal(assigned.draftDiscarded, true);
  assert.equal(assigned.draft, null);
  assert.equal(assigned.evaluation?.revision, 1);
  assert.equal(repository.read().assignments.length, 1);
  assert.throws(() => service.getCall(agent, guided), status(404));
  assert.throws(
    () => service.submit(agent, guided, seed.guidedSubmission, 0, commandKey),
    status(404),
  );
  assert.equal(
    service.getCall({ actorId: second.id, sessionId: 'second' }, guided).assignedAgentDisplayName,
    'Second Agent',
  );
  assert.throws(
    () => service.report(agent, seed.reportRange.from, seed.reportRange.until),
    status(403),
  );
  assert.throws(
    () => service.assign(manager, guided, manager.actorId, assigned.recordVersion, key()),
    status(422),
  );
});

test('export snapshots stay immutable, expire by real elapsed time, and are bounded/session-scoped', () => {
  let now = 1000000;
  const { service } = setup(() => now);
  const report = service.report(manager, seed.reportRange.from, seed.reportRange.until);
  const before = service.exportCsv(manager, report.snapshotToken);
  service.submit(agent, guided, seed.guidedSubmission, 0, key());
  assert.equal(service.exportCsv(manager, report.snapshotToken), before);
  assert.match(before, /Ausstehend/);
  assert.equal(before.charCodeAt(0), 0xfeff);
  assert.equal(before.trimEnd().split('\r\n').length, 13);
  assert.throws(
    () => service.exportCsv({ ...manager, sessionId: 'different-session' }, report.snapshotToken),
    status(410),
  );
  assert.throws(() => service.exportCsv(agent, report.snapshotToken), status(403));
  for (let i = 0; i < 5; i++)
    service.report(manager, seed.reportRange.from, seed.reportRange.until);
  assert.throws(() => service.exportCsv(manager, report.snapshotToken), status(410));
  const fresh = service.report(manager, seed.reportRange.from, seed.reportRange.until);
  now += 300000;
  assert.throws(() => service.exportCsv(manager, fresh.snapshotToken), status(410));
});

test('synthetic canonical replay, excluded and unmapped calls have separate workload semantics', () => {
  const { service, repository } = setup();
  const original = JSON.parse(repository.read().events[0].fingerprint);
  service.ingestSynthetic({ ...original, eventId: 'different-delivery' });
  assert.equal(repository.read().calls.length, 12);
  assert.throws(
    () =>
      service.ingestSynthetic({
        ...original,
        eventId: 'conflicting-delivery',
        endedAt: '2026-09-01T10:00:00Z',
      }),
    status(409),
  );
  assert.equal(repository.read().calls.length, 12);
  service.ingestSynthetic({
    ...original,
    conversationId: 'missed',
    eventId: 'missed',
    handled: false,
    answeredAt: null,
  });
  assert.equal(repository.read().calls.length, 12);
  const unassigned = service.ingestSynthetic({
    ...original,
    conversationId: 'unmapped',
    eventId: 'unmapped',
    externalAgentId: 'absent',
  });
  assert.equal(unassigned?.assignedAgentId, null);
  assert.equal(service.listCalls(agent).length, 12);
  assert.equal(service.listCalls(manager).length, 13);
  assert.equal(
    service.report(manager, seed.reportRange.from, seed.reportRange.until).counts.unassigned,
    1,
  );
  service.newCall(agent);
  assert.equal(service.listCalls(manager).length, 14);
  service.reset();
  assert.equal(service.listCalls(manager).length, 12);
});

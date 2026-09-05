import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import seedJson from '../../demo/seed.json';
import { createServer } from '../../src/server/app';
import { SqliteRepository } from '../../src/server/sqlite';
import { createState } from '../../src/application/repository';
import { ApplicationService } from '../../src/application/service';
import { emptyEvaluation } from '../../src/domain/catalog';
import type { Seed } from '../../src/domain/types';
const seed = seedJson as Seed;
const agent = { actorId: seed.actors[0].id, sessionId: 'agent' },
  manager = { actorId: seed.actors[1].id, sessionId: 'manager' };
const cookieOf = (headers: Record<string, unknown>): string =>
  String(headers['set-cookie']).split(';')[0];

test('SQLite restart restores drafts, receipts, revisions and atomic rollback; online backup restores', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dwc-local-test-'));
  let repo: SqliteRepository | undefined;
  try {
    const path = join(directory, 'state.sqlite'),
      backup = join(directory, 'backup.sqlite');
    repo = new SqliteRepository(path, createState(seed));
    let service = new ApplicationService(repo, seed);
    const draft = service.saveDraft(
      agent,
      seed.guidedCallId,
      { ...emptyEvaluation(), reason: 'dwc_problem' },
      0,
      crypto.randomUUID(),
    );
    repo.close();
    repo = new SqliteRepository(path, createState(seed));
    service = new ApplicationService(repo, seed);
    assert.equal(service.getCall(agent, seed.guidedCallId).draft?.value.reason, 'dwc_problem');
    const key = crypto.randomUUID();
    const first = service.submit(
      agent,
      seed.guidedCallId,
      seed.guidedSubmission,
      draft.recordVersion,
      key,
    );
    const stable = repo.read();
    assert.throws(() =>
      repo!.transact((state) => {
        state.calls.length = 0;
        throw new Error('injected rollback');
      }),
    );
    assert.deepEqual(repo.read(), stable);
    await repo.backupTo(backup);
    repo.close();
    repo = new SqliteRepository(path, createState(seed));
    service = new ApplicationService(repo, seed);
    assert.deepEqual(
      service.submit(agent, seed.guidedCallId, seed.guidedSubmission, draft.recordVersion, key),
      first,
    );
    assert.equal(service.getCall(agent, seed.guidedCallId).history.length, 1);
    const restored = new SqliteRepository(backup, createState(seed));
    try {
      assert.deepEqual(restored.read(), repo.read());
    } finally {
      restored.close();
    }
  } finally {
    repo?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('HTTP session, synthetic role isolation, preconditions, idempotency, snapshot CSV and boundary guards', async () => {
  const app = await createServer();
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/calls' })).statusCode, 401);
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/me', headers: { host: 'evil.example' } }))
        .statusCode,
      403,
    );
    const me = await app.inject({ method: 'GET', url: '/api/me' });
    const cookie = cookieOf(me.headers);
    assert.equal(me.json().role, 'agent');
    assert.match(String(me.headers['set-cookie']), /HttpOnly; SameSite=Strict/);
    const headers = { cookie, 'x-dwc-local': '1' };
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/api/calls',
          headers: { cookie, 'x-role': 'manager' },
        })
      ).json().length,
      12,
    );
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: `/api/reports/summary?from=${seed.reportRange.from}&until=${seed.reportRange.until}`,
          headers: { cookie, 'x-role': 'manager' },
        })
      ).statusCode,
      403,
    );
    const url = `/api/calls/${seed.guidedCallId}/submit`,
      payload = seed.guidedSubmission;
    assert.equal(
      (await app.inject({ method: 'POST', url, headers: { cookie }, payload })).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { ...headers, origin: 'https://evil.example' },
          payload,
        })
      ).statusCode,
      403,
    );
    assert.equal((await app.inject({ method: 'POST', url, headers, payload })).statusCode, 428);
    const key = crypto.randomUUID(),
      commandHeaders = { ...headers, 'if-match': '"0"', 'idempotency-key': key };
    const saved = await app.inject({ method: 'POST', url, headers: commandHeaders, payload });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.headers.etag, '"1"');
    assert.equal(saved.json().evaluation.revision, 1);
    assert.deepEqual(
      (await app.inject({ method: 'POST', url, headers: commandHeaders, payload })).json(),
      saved.json(),
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url,
          headers: { ...commandHeaders, 'idempotency-key': crypto.randomUUID() },
          payload,
        })
      ).statusCode,
      412,
    );
    const role = await app.inject({
      method: 'POST',
      url: '/api/demo/actor',
      headers,
      payload: { role: 'manager' },
    });
    assert.equal(role.statusCode, 200);
    const managerCookie = cookieOf(role.headers);
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/calls', headers: { cookie } })).statusCode,
      401,
    );
    const managerHeaders = { cookie: managerCookie, 'x-dwc-local': '1' };
    const report = await app.inject({
      method: 'GET',
      url: `/api/reports/summary?from=${seed.reportRange.from}&until=${seed.reportRange.until}`,
      headers: managerHeaders,
    });
    assert.equal(report.statusCode, 200);
    assert.equal(report.json().counts.submitted, 11);
    const csv = await app.inject({
      method: 'POST',
      url: '/api/reports/export',
      headers: managerHeaders,
      payload: { snapshotToken: report.json().snapshotToken },
    });
    assert.equal(csv.statusCode, 200);
    assert.match(String(csv.headers['content-type']), /text\/csv/);
    assert.equal(csv.headers['x-report-timezone'], 'Europe/Zurich');
    assert.equal(csv.body.trimEnd().split('\r\n').length, 13);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/demo/actor',
          headers: managerHeaders,
          payload: { role: 'administrator' },
        })
      ).statusCode,
      422,
    );
    const reset = await app.inject({
      method: 'POST',
      url: '/api/demo/reset',
      headers: managerHeaders,
      payload: {},
    });
    assert.equal(reset.statusCode, 204);
    const resetCookie = cookieOf(reset.headers);
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: resetCookie } })).json()
        .role,
      'agent',
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/calls', headers: { cookie: resetCookie } }))
        .json()
        .filter((call: { evaluation: unknown }) => call.evaluation).length,
      10,
    );
  } finally {
    await app.close();
  }
});

test('HTTP rejects out-of-scope direct reads/writes and retired snapshots after session change', async () => {
  const modified = structuredClone(seed);
  modified.calls[11].assignedAgentId = null;
  const app = await createServer({ seed: modified });
  try {
    const me = await app.inject({ method: 'GET', url: '/api/me' });
    let cookie = cookieOf(me.headers);
    const callPath = `/api/calls/${modified.calls[11].id}`;
    assert.equal(
      (await app.inject({ method: 'GET', url: callPath, headers: { cookie } })).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: `${callPath}/draft`,
          headers: {
            cookie,
            'x-dwc-local': '1',
            'if-match': '"0"',
            'idempotency-key': crypto.randomUUID(),
          },
          payload: emptyEvaluation(),
        })
      ).statusCode,
      404,
    );
    const role = await app.inject({
      method: 'POST',
      url: '/api/demo/actor',
      headers: { cookie, 'x-dwc-local': '1' },
      payload: { role: 'manager' },
    });
    cookie = cookieOf(role.headers);
    const report = (
      await app.inject({
        method: 'GET',
        url: `/api/reports/summary?from=${seed.reportRange.from}&until=${seed.reportRange.until}`,
        headers: { cookie },
      })
    ).json();
    assert.equal(report.counts.unassigned, 1);
    const secondRole = await app.inject({
      method: 'POST',
      url: '/api/demo/actor',
      headers: { cookie, 'x-dwc-local': '1' },
      payload: { role: 'manager' },
    });
    cookie = cookieOf(secondRole.headers);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/reports/export',
          headers: { cookie, 'x-dwc-local': '1' },
          payload: { snapshotToken: report.snapshotToken },
        })
      ).statusCode,
      410,
    );
  } finally {
    await app.close();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import seedJson from '../../demo/seed.json';
import { createState } from '../../src/application/repository';
import { buildReport, selectReportRows, validateRange } from '../../src/domain/reporting';
import { csvCell, serializeCsv } from '../../src/domain/csv';
import type { Seed } from '../../src/domain/types';
const seed = seedJson as Seed;
const base = createState(seed).calls[0];

test('Zurich spring DST includes exactly the 23-hour reporting-local date', () => {
  const calls = [
    '2026-03-28T22:59:59Z',
    '2026-03-28T23:00:00Z',
    '2026-03-29T00:30:00Z',
    '2026-03-29T21:59:59Z',
    '2026-03-29T22:00:00Z',
  ].map((endedAt, i) => ({ ...base, id: String(i), endedAt }));
  assert.deepEqual(
    selectReportRows(calls, '2026-03-29', '2026-03-30', 'Europe/Zurich').map((call) => call.id),
    ['1', '2', '3'],
  );
});
test('Zurich fall DST includes both repeated local hours within the 25-hour date', () => {
  const calls = [
    '2026-10-24T21:59:59Z',
    '2026-10-24T22:00:00Z',
    '2026-10-25T00:30:00Z',
    '2026-10-25T01:30:00Z',
    '2026-10-25T22:59:59Z',
    '2026-10-25T23:00:00Z',
  ].map((endedAt, i) => ({ ...base, id: String(i), endedAt }));
  assert.deepEqual(
    selectReportRows(calls, '2026-10-25', '2026-10-26', 'Europe/Zurich').map((call) => call.id),
    ['1', '2', '3', '4'],
  );
});
test('empty report has null percentages and zero-filled dates; invalid or excessive periods fail', () => {
  const report = buildReport(
    [],
    '2026-08-01',
    '2026-08-03',
    seed.timezone,
    seed.fixedNow,
    'token',
    seed.fixedNow,
  );
  assert.equal(report.reasonPercent, null);
  assert.equal(report.dwcFaultPercent, null);
  assert.equal(report.completionPercent, null);
  assert.equal(report.daily.length, 2);
  assert.equal(report.periodIsPartial, false);
  for (const [from, until] of [
    ['2026-02-30', '2026-03-03'],
    ['2026-09-05', '2026-09-05'],
    ['2020-01-01', '2026-01-01'],
  ])
    assert.throws(() => validateRange(from, until));
});
test('CSV neutralizes formulas after whitespace and escapes semicolon/quote/newline text', () => {
  for (const value of ['=1+1', '+cmd', '-2+3', '@SUM(A1)', '  =1', '\t=1', '\r=1'])
    assert.match(csvCell(value), /^"'/);
  assert.equal(csvCell('A;"B"\nC'), '"A;""B""\nC"');
  const call = { ...base, assignedAgentDisplayName: '=HYPERLINK("https://invalid")' };
  const report = buildReport(
    [call],
    seed.reportRange.from,
    seed.reportRange.until,
    seed.timezone,
    seed.fixedNow,
    'token',
    seed.fixedNow,
  );
  const csv = serializeCsv([call], report);
  assert.ok(csv.includes('"\'=HYPERLINK(""https://invalid"")"'));
  assert.ok(csv.includes('Europe/Zurich'));
  assert.ok(!csv.includes('conversationId'));
  assert.ok(!csv.includes('eventId'));
});

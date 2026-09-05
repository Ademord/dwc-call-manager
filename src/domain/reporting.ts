import { fail } from './errors';
import type { Call, Counts, DailyCounts, Report, Shares } from './types';
export function localDate(instant: string | number | Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (name: string) => parts.find((item) => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}
export function validateRange(from: string, until: string): string[] {
  const valid = (s: string) =>
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(`${s}T00:00:00Z`)) &&
    new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  if (!valid(from) || !valid(until) || from >= until)
    fail(
      422,
      'INVALID_RANGE',
      'Bitte einen gültigen Zeitraum auswählen; das Enddatum ist exklusiv.',
    );
  if ((Date.parse(until) - Date.parse(from)) / 86400000 > 366)
    fail(
      422,
      'RANGE_TOO_LARGE',
      'Der lokale Prototyp unterstützt höchstens 366 Kalendertage pro Bericht.',
    );
  const days: string[] = [];
  for (let day = from; day < until; day = nextDate(day)) days.push(day);
  return days;
}
export const emptyCounts = (): Counts => ({
  total: 0,
  submitted: 0,
  pending: 0,
  unassigned: 0,
  order: 0,
  invoice: 0,
  dwc_problem: 0,
  other: 0,
});
export const percent = (count: number, denominator: number): number | null =>
  denominator ? Math.round((count / denominator) * 1000) / 10 : null;
function shares(counts: Record<string, number>, denominator: number): Shares {
  return denominator
    ? Object.fromEntries(Object.entries(counts).map(([key, n]) => [key, percent(n, denominator)!]))
    : null;
}
function increment(counts: Counts, call: Call): void {
  counts.total++;
  if (!call.assignedAgentId) counts.unassigned++;
  if (call.evaluation?.value.reason) {
    counts.submitted++;
    counts[call.evaluation.value.reason]++;
  } else counts.pending++;
}
export function selectReportRows(
  calls: Call[],
  from: string,
  until: string,
  timezone: string,
): Call[] {
  validateRange(from, until);
  // Comparing reporting-local calendar dates is equivalent to independent local
  // midnight bounds. It never assumes that a DST transition day is 24 hours.
  return calls.filter(
    (call) =>
      call.handled &&
      call.answeredAt &&
      call.endedAt &&
      (() => {
        const date = localDate(call.endedAt, timezone);
        return date >= from && date < until;
      })(),
  );
}
export function buildReport(
  rows: Call[],
  from: string,
  until: string,
  timezone: string,
  generatedAt: string,
  snapshotToken: string,
  expiresAt: string,
): Report {
  const counts = emptyCounts();
  const daily: DailyCounts[] = validateRange(from, until).map((date) => ({
    date,
    ...emptyCounts(),
  }));
  const byDate = new Map(daily.map((day) => [day.date, day]));
  const dwcFaultCounts: Record<string, number> = {},
    deviceCounts: Record<string, number> = {},
    resolutionCounts: Record<string, number> = {};
  for (const call of rows) {
    increment(counts, call);
    const day = byDate.get(localDate(call.endedAt, timezone));
    if (day) increment(day, call);
    const value = call.evaluation?.value;
    if (value?.reason === 'dwc_problem')
      for (const [code, bucket] of [
        [value.fault, dwcFaultCounts],
        [value.device, deviceCounts],
        [value.resolution, resolutionCounts],
      ] as const)
        if (code) bucket[code] = (bucket[code] ?? 0) + 1;
  }
  const today = localDate(generatedAt, timezone);
  return {
    counts,
    reasonDenominator: counts.total,
    reasonPercent: shares(
      {
        order: counts.order,
        invoice: counts.invoice,
        dwc_problem: counts.dwc_problem,
        other: counts.other,
        pending: counts.pending,
      },
      counts.total,
    ),
    completionPercent: percent(counts.submitted, counts.total),
    dwcFaultDenominator: counts.dwc_problem,
    dwcFaultCounts,
    deviceCounts,
    resolutionCounts,
    dwcFaultPercent: shares(dwcFaultCounts, counts.dwc_problem),
    devicePercent: shares(deviceCounts, counts.dwc_problem),
    resolutionPercent: shares(resolutionCounts, counts.dwc_problem),
    daily,
    from,
    until,
    timezone,
    generatedAt,
    periodIsPartial: from <= today && today < until,
    snapshotToken,
    metadata: { mode: 'synthetic', completeness: 'unverified', rows: rows.length, expiresAt },
  };
}

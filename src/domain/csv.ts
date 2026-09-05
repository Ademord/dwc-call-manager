import { labelFor } from './catalog';
import type { Call, Report } from './types';
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function serializeCsv(rows: Call[], report: Report): string {
  const columns = [
    'Anruf-ID',
    'Anrufende (lokal)',
    'Mitarbeitende',
    'Status',
    'Anrufgrund',
    'Gerät',
    'Störung',
    'Ergebnis',
    'Revision',
    'Zeitraum von',
    'Zeitraum bis (exklusiv)',
    'Zeitzone',
    'Bericht erstellt (UTC)',
  ];
  const format = new Intl.DateTimeFormat('de-CH', {
    timeZone: report.timezone,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
  const lines: unknown[][] = [columns];
  for (const call of rows) {
    const value = call.evaluation?.value;
    lines.push([
      call.id,
      format.format(new Date(call.endedAt)),
      call.assignedAgentDisplayName ?? 'Unzugeordnet',
      call.evaluation ? 'Ausgewertet' : 'Ausstehend',
      labelFor('reason', value?.reason),
      labelFor('device', value?.device),
      labelFor('fault', value?.fault),
      labelFor('resolution', value?.resolution),
      call.evaluation?.revision ?? '',
      report.from,
      report.until,
      report.timezone,
      report.generatedAt,
    ]);
  }
  return '\uFEFF' + lines.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

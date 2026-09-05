export const integer = (value: number) => new Intl.NumberFormat('de-CH').format(value);
export const percent = (value: number | null | undefined) =>
  value == null
    ? '—'
    : `${new Intl.NumberFormat('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} %`;
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat('de-CH', {
    timeZone: 'Europe/Zurich',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
export const dayLabel = (value: string) =>
  new Intl.DateTimeFormat('de-CH', { timeZone: 'UTC', day: '2-digit', month: 'short' }).format(
    new Date(`${value}T12:00:00Z`),
  );
export function addDay(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function commandKey() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const n = Math.floor(Math.random() * 16);
      return (c === 'x' ? n : (n & 3) | 8).toString(16);
    })
  );
}
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Die Aktion konnte nicht abgeschlossen werden.';

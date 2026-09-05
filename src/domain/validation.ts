import { catalog } from './catalog';
import { fail } from './errors';
import type { EvaluationValue, SyntheticEvent } from './types';
const fields = ['catalogVersion', 'reason', 'device', 'fault', 'resolution'];
export function validateEvaluation(input: unknown, complete: boolean): EvaluationValue {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail(400, 'INVALID_SHAPE', 'Ungültige Auswertung.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== fields.length || fields.some((key) => !(key in value)))
    fail(400, 'INVALID_SHAPE', 'Die Auswertung muss genau die vorgesehenen Felder enthalten.');
  if (value.catalogVersion !== 1)
    fail(422, 'CATALOG_VERSION', 'Katalogversion nicht unterstützt. Bitte neu laden.');
  for (const [field, options] of [
    ['reason', catalog.reasons],
    ['device', catalog.devices],
    ['fault', catalog.faults],
    ['resolution', catalog.resolutions],
  ] as const) {
    if (value[field] !== null && !options.some((option) => option.code === value[field]))
      fail(422, 'UNKNOWN_CODE', `Ungültige Auswahl: ${field}.`);
  }
  if (complete && value.reason === null)
    fail(422, 'REASON_REQUIRED', 'Bitte einen Anrufgrund auswählen.');
  if (
    value.reason !== 'dwc_problem' &&
    ['device', 'fault', 'resolution'].some((field) => value[field] !== null)
  )
    fail(422, 'INCOMPATIBLE_FIELDS', 'DWC-Angaben sind nur bei Problem DWC erlaubt.');
  if (
    complete &&
    value.reason === 'dwc_problem' &&
    ['device', 'fault', 'resolution'].some((field) => value[field] === null)
  )
    fail(422, 'DWC_REQUIRED', 'Bitte Gerät, Störung und Ergebnis auswählen.');
  return structuredClone(value) as unknown as EvaluationValue;
}
export const isUuid = (input: unknown): input is string =>
  typeof input === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input);
export function validateEvent(event: SyntheticEvent): void {
  for (const field of ['provider', 'eventId', 'conversationId'] as const)
    if (typeof event[field] !== 'string' || !event[field].length || event[field].length > 200)
      fail(422, 'INVALID_EVENT', 'Ungültige synthetische Ereignisidentität.');
  if (!['inbound', 'outbound'].includes(event.direction) || typeof event.handled !== 'boolean')
    fail(422, 'INVALID_EVENT', 'Ungültige synthetische Anrufdaten.');
  const times = [event.startedAt, event.endedAt, ...(event.answeredAt ? [event.answeredAt] : [])];
  if (
    times.some(
      (time) =>
        typeof time !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(time) ||
        !Number.isFinite(Date.parse(time)),
    )
  )
    fail(422, 'INVALID_TIME', 'Ungültige Anrufzeit.');
  if (
    (event.handled && !event.answeredAt) ||
    Date.parse(event.startedAt) > Date.parse(event.endedAt) ||
    (event.answeredAt &&
      (Date.parse(event.answeredAt) < Date.parse(event.startedAt) ||
        Date.parse(event.answeredAt) > Date.parse(event.endedAt)))
  )
    fail(422, 'INVALID_TIME', 'Die zeitliche Reihenfolge des Anrufs ist ungültig.');
}

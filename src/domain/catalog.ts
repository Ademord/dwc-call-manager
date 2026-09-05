import type { EvaluationValue } from './types';
export const catalog = {
  version: 1,
  reasons: [
    { code: 'order', label: 'Bestellung' },
    { code: 'invoice', label: 'Rechnung' },
    { code: 'dwc_problem', label: 'Problem DWC' },
    { code: 'other', label: 'Sonstiges' },
  ],
  devices: [
    { code: 'tuma_classic_comfort', label: 'Tuma Classic / Comfort' },
    { code: 'other', label: 'Anderes DWC' },
    { code: 'unknown', label: 'Unbekannt' },
  ],
  faults: [
    { code: 'descaling_filter', label: 'Entkalkung / Filterwechsel' },
    { code: 'shower_dryer_arm', label: 'Dusch- / Föhnarm' },
    { code: 'remote_control', label: 'Fernbedienung' },
    { code: 'no_water', label: 'Kein Wasser' },
    { code: 'error_code', label: 'Fehlercode' },
    { code: 'leak', label: 'Undicht / rinnt' },
    { code: 'seat_lid', label: 'Sitzring / Deckel' },
    { code: 'other', label: 'Sonstiges' },
    { code: 'unknown', label: 'Unklar' },
  ],
  resolutions: [
    { code: 'resolved_during_call', label: 'Im Gespräch behoben' },
    { code: 'service_requested', label: 'Service angefordert' },
    { code: 'follow_up_required', label: 'Nachverfolgung erforderlich' },
    { code: 'unresolved', label: 'Nicht behoben' },
    { code: 'unknown', label: 'Unklar' },
  ],
} as const;
export const emptyEvaluation = (): EvaluationValue => ({
  catalogVersion: 1,
  reason: null,
  device: null,
  fault: null,
  resolution: null,
});
export function labelFor(
  field:
    | 'reason'
    | 'device'
    | 'fault'
    | 'resolution'
    | 'reasons'
    | 'devices'
    | 'faults'
    | 'resolutions',
  code: string | null | undefined,
): string {
  if (!code) return '';
  const key = (field.endsWith('s') ? field : `${field}s`) as
    | 'reasons'
    | 'devices'
    | 'faults'
    | 'resolutions';
  return catalog[key].find((item) => item.code === code)?.label ?? code;
}
export function changeReason(
  value: EvaluationValue,
  reason: EvaluationValue['reason'],
): EvaluationValue {
  return reason === 'dwc_problem' ? { ...value, reason } : { ...emptyEvaluation(), reason };
}

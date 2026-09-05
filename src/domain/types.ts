export type Role = 'agent' | 'manager';
export interface Actor {
  id: string;
  displayName: string;
  role: Role;
  active: boolean;
}
export type Reason = 'order' | 'invoice' | 'dwc_problem' | 'other';
export type Device = 'tuma_classic_comfort' | 'other' | 'unknown';
export type Fault =
  | 'descaling_filter'
  | 'shower_dryer_arm'
  | 'remote_control'
  | 'no_water'
  | 'error_code'
  | 'leak'
  | 'seat_lid'
  | 'other'
  | 'unknown';
export type Resolution =
  | 'resolved_during_call'
  | 'service_requested'
  | 'follow_up_required'
  | 'unresolved'
  | 'unknown';
export interface EvaluationValue {
  catalogVersion: 1;
  reason: Reason | null;
  device: Device | null;
  fault: Fault | null;
  resolution: Resolution | null;
}
export interface Evaluation {
  value: EvaluationValue;
  revision: number;
  submittedBy: string;
  submittedAt: string;
}
export interface Draft {
  value: EvaluationValue;
  editedBy: string;
  editedAt: string;
}
export interface Call {
  id: string;
  provider: string;
  conversationId: string;
  eventId: string;
  displayRef: string;
  direction: 'inbound' | 'outbound';
  startedAt: string;
  answeredAt: string | null;
  endedAt: string;
  handled: boolean;
  assignedAgentId: string | null;
  assignedAgentDisplayName: string | null;
  recordVersion: number;
  evaluation: Evaluation | null;
  draft: Draft | null;
  history: Evaluation[];
  draftDiscarded?: boolean;
}
export interface Counts {
  total: number;
  submitted: number;
  pending: number;
  unassigned: number;
  order: number;
  invoice: number;
  dwc_problem: number;
  other: number;
}
export interface DailyCounts extends Counts {
  date: string;
}
export type Shares = Record<string, number> | null;
export interface Report {
  counts: Counts;
  reasonDenominator: number;
  reasonPercent: Shares;
  completionPercent: number | null;
  dwcFaultDenominator: number;
  dwcFaultCounts: Record<string, number>;
  deviceCounts: Record<string, number>;
  resolutionCounts: Record<string, number>;
  dwcFaultPercent: Shares;
  devicePercent: Shares;
  resolutionPercent: Shares;
  daily: DailyCounts[];
  from: string;
  until: string;
  timezone: string;
  generatedAt: string;
  periodIsPartial: boolean;
  snapshotToken: string;
  metadata: { mode: 'synthetic'; completeness: 'unverified'; rows: number; expiresAt: string };
}
export interface Seed {
  schemaVersion: 1;
  fixedNow: string;
  timezone: string;
  reportRange: { from: string; until: string };
  actors: Actor[];
  providerAgentMappings: { provider: string; externalAgentId: string; userId: string }[];
  calls: Array<
    Omit<Call, 'history' | 'assignedAgentDisplayName'> &
      Partial<Pick<Call, 'history' | 'assignedAgentDisplayName'>>
  >;
  guidedCallId: string;
  guidedSubmission: EvaluationValue;
}
export interface Context {
  actorId: string;
  sessionId: string;
}
export interface SyntheticEvent {
  provider: string;
  eventId: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  startedAt: string;
  answeredAt: string | null;
  endedAt: string;
  handled: boolean;
  externalAgentId: string | null;
}

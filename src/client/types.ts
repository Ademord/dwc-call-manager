import type { Actor, Call, EvaluationValue, Report, Role } from '../domain/types';
export type FaultMode = 'none' | 'before' | 'after';
export interface Client {
  me(): Promise<Actor>;
  setActor(role: Role): Promise<Actor>;
  listCalls(): Promise<Call[]>;
  getCall(id: string): Promise<Call>;
  saveDraft(id: string, value: EvaluationValue, version: number, key: string): Promise<Call>;
  submit(id: string, value: EvaluationValue, version: number, key: string): Promise<Call>;
  assign(id: string, agentId: string, version: number, key: string): Promise<Call>;
  report(from: string, until: string): Promise<Report>;
  exportCsv(token: string): Promise<string>;
  reset(): Promise<void>;
  replayCall(id: string): Promise<void>;
  newCall(): Promise<Call>;
  setFault(mode: FaultMode): void;
}

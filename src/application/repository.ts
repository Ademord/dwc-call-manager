import type { Actor, Call, Seed, SyntheticEvent } from '../domain/types';
export interface Receipt {
  actorId: string;
  key: string;
  fingerprint: string;
  response: Call;
}
export interface AssignmentAudit {
  callId: string;
  from: string | null;
  to: string;
  actorId: string;
  at: string;
  draftDiscarded: boolean;
}
export interface State {
  schemaVersion: 1;
  actors: Actor[];
  calls: Call[];
  receipts: Receipt[];
  assignments: AssignmentAudit[];
  events: Array<{ provider: string; eventId: string; fingerprint: string; callId: string | null }>;
  canonicalEvents: Array<{
    provider: string;
    conversationId: string;
    fingerprint: string;
    callId: string | null;
  }>;
  sequence: number;
}
export interface Repository {
  read(): State;
  transact<T>(work: (state: State) => T): T;
  reset(state: State): void;
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function eventFingerprint(event: SyntheticEvent, includeEvent = true): string {
  const { eventId, ...facts } = event;
  return canonicalJson(includeEvent ? event : facts);
}
export function createState(seed: Seed): State {
  if (seed.schemaVersion !== 1) throw new Error('Unsupported synthetic seed schema.');
  const calls: Call[] = seed.calls.map((call) => ({
    ...structuredClone(call),
    assignedAgentDisplayName:
      seed.actors.find((actor) => actor.id === call.assignedAgentId)?.displayName ?? null,
    history: structuredClone(call.history ?? (call.evaluation ? [call.evaluation] : [])),
  }));
  const state: State = {
    schemaVersion: 1,
    actors: structuredClone(seed.actors),
    calls,
    receipts: [],
    assignments: [],
    events: [],
    canonicalEvents: [],
    sequence: 100,
  };
  for (const call of calls) {
    const event: SyntheticEvent = {
      provider: call.provider,
      eventId: call.eventId,
      conversationId: call.conversationId,
      direction: call.direction,
      startedAt: call.startedAt,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
      handled: call.handled,
      externalAgentId:
        seed.providerAgentMappings.find(
          (mapping) =>
            mapping.provider === call.provider && mapping.userId === call.assignedAgentId,
        )?.externalAgentId ?? null,
    };
    state.events.push({
      provider: event.provider,
      eventId: event.eventId,
      fingerprint: eventFingerprint(event),
      callId: call.id,
    });
    state.canonicalEvents.push({
      provider: event.provider,
      conversationId: event.conversationId,
      fingerprint: eventFingerprint(event, false),
      callId: call.id,
    });
  }
  return state;
}
export class MemoryRepository implements Repository {
  private state: State;
  constructor(initial: State) {
    this.state = structuredClone(initial);
  }
  read(): State {
    return structuredClone(this.state);
  }
  transact<T>(work: (state: State) => T): T {
    const candidate = this.read();
    const result = work(candidate);
    this.state = candidate;
    return structuredClone(result);
  }
  reset(state: State): void {
    this.state = structuredClone(state);
  }
}

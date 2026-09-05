import { fail } from '../domain/errors';
import { serializeCsv } from '../domain/csv';
import { buildReport, selectReportRows } from '../domain/reporting';
import { isUuid, validateEvaluation, validateEvent } from '../domain/validation';
import type { Actor, Call, Context, Report, Seed, SyntheticEvent } from '../domain/types';
import {
  canonicalJson,
  createState,
  eventFingerprint,
  type Repository,
  type State,
} from './repository';

const MAX_CALLS = 10000,
  MAX_RECEIPTS = 20000,
  MAX_EVENTS = 30000;
const MAX_SNAPSHOTS_PER_SESSION = 5,
  MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;
interface Snapshot {
  sessionId: string;
  actorId: string;
  expires: number;
  bytes: number;
  csv: string;
  report: Report;
}
export class ApplicationService {
  private snapshots = new Map<string, Snapshot>();
  constructor(
    public readonly repository: Repository,
    public readonly seed: Seed,
    private readonly leaseClock: () => number = Date.now,
  ) {}
  private actor(state: State, context: Context): Actor {
    return (
      state.actors.find((actor) => actor.id === context.actorId && actor.active) ??
      fail(401, 'SESSION_REQUIRED', 'Synthetische Sitzung abgelaufen. Bitte neu laden.')
    );
  }
  private manager(state: State, context: Context): Actor {
    const actor = this.actor(state, context);
    if (actor.role !== 'manager')
      fail(
        403,
        'MANAGER_REQUIRED',
        'Diese Funktion ist nur für die synthetische Manager-Rolle verfügbar.',
      );
    return actor;
  }
  private scoped(state: State, context: Context, id: string): Call {
    const actor = this.actor(state, context);
    return (
      state.calls.find(
        (call) =>
          call.id === id &&
          call.handled &&
          !!call.answeredAt &&
          (actor.role === 'manager' || call.assignedAgentId === actor.id),
      ) ?? fail(404, 'CALL_NOT_FOUND', 'Anruf nicht gefunden oder nicht mehr zugeordnet.')
    );
  }
  private view(state: State, call: Call): Call {
    return structuredClone({
      ...call,
      assignedAgentDisplayName:
        state.actors.find((actor) => actor.id === call.assignedAgentId)?.displayName ?? null,
    });
  }
  me(context: Context): Actor {
    return structuredClone(this.actor(this.repository.read(), context));
  }
  agents(context: Context): Actor[] {
    const state = this.repository.read();
    this.manager(state, context);
    return state.actors
      .filter((actor) => actor.active && actor.role === 'agent')
      .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
  }
  listCalls(context: Context): Call[] {
    const state = this.repository.read();
    const actor = this.actor(state, context);
    return state.calls
      .filter(
        (call) =>
          call.handled &&
          call.answeredAt &&
          (actor.role === 'manager' || call.assignedAgentId === actor.id),
      )
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt) || b.id.localeCompare(a.id))
      .map((call) => this.view(state, call));
  }
  getCall(context: Context, id: string): Call {
    const state = this.repository.read();
    return this.view(state, this.scoped(state, context, id));
  }
  private mutate(
    context: Context,
    id: string,
    operation: 'draft' | 'submit' | 'assignment',
    body: unknown,
    version: number,
    key: string,
  ): Call {
    return this.repository.transact((state) => {
      const actor = this.actor(state, context);
      if (operation === 'assignment') this.manager(state, context);
      const call = this.scoped(state, context, id);
      if (!isUuid(key))
        fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Ein gültiger Idempotenzschlüssel ist erforderlich.');
      if (version === undefined || version === null)
        fail(428, 'VERSION_REQUIRED', 'Die bestätigte Datensatzversion ist erforderlich.');
      if (!Number.isSafeInteger(version) || version < 0)
        fail(400, 'INVALID_VERSION', 'Ungültige Datensatzversion.');
      const fingerprint = canonicalJson({ operation, id, version, body });
      const receipt = state.receipts.find((item) => item.actorId === actor.id && item.key === key);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          fail(
            409,
            'IDEMPOTENCY_REUSE',
            'Dieser Wiederholungsschlüssel gehört zu einer anderen Anfrage.',
          );
        return receipt.response;
      }
      if (version !== call.recordVersion)
        fail(
          412,
          'VERSION_CONFLICT',
          'Der Anruf wurde inzwischen geändert. Bitte aktuellen Stand laden und Eingaben prüfen.',
          { recordVersion: call.recordVersion },
        );
      if (state.receipts.length >= MAX_RECEIPTS)
        fail(
          507,
          'PROTOTYPE_LIMIT',
          'Befehlsgrenze des lokalen Prototyps erreicht. Synthetische Daten zurücksetzen.',
        );
      const at = this.seed.fixedNow;
      if (operation === 'assignment') {
        const agentId = (body as { agentId?: unknown })?.agentId;
        const target = state.actors.find(
          (item) => item.id === agentId && item.active && item.role === 'agent',
        );
        if (!target) fail(422, 'INVALID_AGENT', 'Bitte aktive Mitarbeitende auswählen.');
        const discarded = !!call.draft;
        state.assignments.push({
          callId: id,
          from: call.assignedAgentId,
          to: target.id,
          actorId: actor.id,
          at,
          draftDiscarded: discarded,
        });
        call.assignedAgentId = target.id;
        call.draft = null;
        call.draftDiscarded = discarded;
      } else {
        const value = validateEvaluation(body, operation === 'submit');
        delete call.draftDiscarded;
        if (operation === 'draft') call.draft = { value, editedBy: actor.id, editedAt: at };
        else {
          const evaluation = {
            value,
            revision: (call.evaluation?.revision ?? 0) + 1,
            submittedBy: actor.id,
            submittedAt: at,
          };
          call.evaluation = evaluation;
          call.history.push(structuredClone(evaluation));
          call.draft = null;
        }
      }
      call.recordVersion++;
      const response = this.view(state, call);
      state.receipts.push({
        actorId: actor.id,
        key,
        fingerprint,
        response: structuredClone(response),
      });
      return response;
    });
  }
  saveDraft(context: Context, id: string, value: unknown, version: number, key: string): Call {
    return this.mutate(context, id, 'draft', value, version, key);
  }
  submit(context: Context, id: string, value: unknown, version: number, key: string): Call {
    return this.mutate(context, id, 'submit', value, version, key);
  }
  assign(context: Context, id: string, agentId: string, version: number, key: string): Call {
    return this.mutate(context, id, 'assignment', { agentId }, version, key);
  }
  report(context: Context, from: string, until: string): Report {
    const state = this.repository.read();
    this.manager(state, context);
    const now = this.leaseClock();
    for (const [token, snapshot] of this.snapshots)
      if (snapshot.expires <= now) this.snapshots.delete(token);
    const rows = selectReportRows(
      state.calls.map((call) => this.view(state, call)),
      from,
      until,
      this.seed.timezone,
    );
    const token = crypto.randomUUID();
    const expires = now + 5 * 60 * 1000;
    const report = buildReport(
      rows,
      from,
      until,
      this.seed.timezone,
      this.seed.fixedNow,
      token,
      new Date(expires).toISOString(),
    );
    const csv = serializeCsv(rows, report);
    const bytes = new TextEncoder().encode(csv).byteLength;
    if (bytes > MAX_SNAPSHOT_BYTES)
      fail(
        413,
        'REPORT_TOO_LARGE',
        'Der Bericht überschreitet die lokale Exportgrenze. Zeitraum verkleinern.',
      );
    for (const [oldToken] of [...this.snapshots]
      .filter(([, snap]) => snap.sessionId === context.sessionId)
      .slice(
        0,
        Math.max(
          0,
          [...this.snapshots.values()].filter((snap) => snap.sessionId === context.sessionId)
            .length -
            MAX_SNAPSHOTS_PER_SESSION +
            1,
        ),
      ))
      this.snapshots.delete(oldToken);
    while (
      [...this.snapshots.values()].reduce((sum, snap) => sum + snap.bytes, 0) + bytes >
      MAX_SNAPSHOT_BYTES
    )
      this.snapshots.delete(this.snapshots.keys().next().value!);
    this.snapshots.set(token, {
      sessionId: context.sessionId,
      actorId: context.actorId,
      expires,
      bytes,
      csv,
      report,
    });
    return structuredClone(report);
  }
  exportSnapshot(context: Context, token: string): { csv: string; report: Report } {
    this.manager(this.repository.read(), context);
    const snapshot = this.snapshots.get(token);
    if (
      !snapshot ||
      snapshot.expires <= this.leaseClock() ||
      snapshot.sessionId !== context.sessionId ||
      snapshot.actorId !== context.actorId
    )
      fail(
        410,
        'REPORT_REFRESH_REQUIRED',
        'Bericht abgelaufen oder nicht mehr verfügbar. Bitte Dashboard aktualisieren.',
      );
    return { csv: snapshot.csv, report: structuredClone(snapshot.report) };
  }
  exportCsv(context: Context, token: string): string {
    return this.exportSnapshot(context, token).csv;
  }
  reset(): void {
    this.repository.reset(createState(this.seed));
    this.snapshots.clear();
  }
  // Only the explicitly synthetic adapter calls this port. No provider webhook is exposed.
  ingestSynthetic(event: SyntheticEvent): Call | null {
    validateEvent(event);
    return this.repository.transact((state) => {
      const full = eventFingerprint(event),
        terminal = eventFingerprint(event, false);
      const delivery = state.events.find(
        (item) => item.provider === event.provider && item.eventId === event.eventId,
      );
      if (delivery) {
        if (delivery.fingerprint !== full)
          fail(
            409,
            'EVENT_CONFLICT',
            'Synthetisches Ereignis widerspricht einer früheren Lieferung.',
          );
        return state.calls.find((call) => call.id === delivery.callId) ?? null;
      }
      const canonical = state.canonicalEvents.find(
        (item) => item.provider === event.provider && item.conversationId === event.conversationId,
      );
      if (canonical && canonical.fingerprint !== terminal)
        fail(
          409,
          'CONVERSATION_CONFLICT',
          'Abweichende Abschlussdaten erfordern eine Untersuchung; der Anruf bleibt unverändert.',
        );
      if (state.events.length >= MAX_EVENTS)
        fail(507, 'PROTOTYPE_LIMIT', 'Ereignisgrenze des lokalen Prototyps erreicht.');
      if (canonical) {
        state.events.push({
          provider: event.provider,
          eventId: event.eventId,
          fingerprint: full,
          callId: canonical.callId,
        });
        return state.calls.find((call) => call.id === canonical.callId) ?? null;
      }
      if (state.calls.length >= MAX_CALLS)
        fail(507, 'PROTOTYPE_LIMIT', 'Der lokale Prototyp unterstützt höchstens 10.000 Anrufe.');
      let call: Call | null = null;
      if (event.handled) {
        const id = `00000000-0000-4000-8000-${String(++state.sequence).padStart(12, '0')}`;
        const mappedId = this.seed.providerAgentMappings.find(
          (mapping) =>
            mapping.provider === event.provider &&
            mapping.externalAgentId === event.externalAgentId,
        )?.userId;
        const assigned = state.actors.find(
          (actor) => actor.id === mappedId && actor.active && actor.role === 'agent',
        );
        call = {
          id,
          provider: event.provider,
          eventId: event.eventId,
          conversationId: event.conversationId,
          displayRef: `DEMO-${String(state.sequence).padStart(3, '0')}`,
          direction: event.direction,
          startedAt: event.startedAt,
          answeredAt: event.answeredAt,
          endedAt: event.endedAt,
          handled: true,
          assignedAgentId: assigned?.id ?? null,
          assignedAgentDisplayName: assigned?.displayName ?? null,
          recordVersion: 0,
          evaluation: null,
          draft: null,
          history: [],
        };
        state.calls.push(call);
      }
      state.events.push({
        provider: event.provider,
        eventId: event.eventId,
        fingerprint: full,
        callId: call?.id ?? null,
      });
      state.canonicalEvents.push({
        provider: event.provider,
        conversationId: event.conversationId,
        fingerprint: terminal,
        callId: call?.id ?? null,
      });
      return call;
    });
  }
  replayCall(context: Context, id: string): void {
    const call = this.getCall(context, id);
    // Replay original terminal evidence, even after a manager reassigned the call.
    const event = this.repository
      .read()
      .events.find((item) => item.provider === call.provider && item.eventId === call.eventId);
    if (!event) fail(404, 'EVENT_NOT_FOUND', 'Synthetisches Ausgangsereignis fehlt.');
    this.ingestSynthetic(JSON.parse(event.fingerprint) as SyntheticEvent);
  }
  newCall(context: Context): Call {
    this.me(context);
    const sequence = this.repository.read().sequence + 1;
    const end = new Date(this.seed.fixedNow).getTime();
    return this.ingestSynthetic({
      provider: 'demo',
      eventId: `synthetic-ended-${sequence}`,
      conversationId: `synthetic-conversation-${sequence}`,
      direction: 'inbound',
      startedAt: new Date(end - 240000).toISOString(),
      answeredAt: new Date(end - 230000).toISOString(),
      endedAt: new Date(end).toISOString(),
      handled: true,
      externalAgentId: this.seed.providerAgentMappings[0]?.externalAgentId ?? null,
    })!;
  }
}

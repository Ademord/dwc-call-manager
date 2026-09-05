import fixture from '../../demo/seed.json';
import { ApplicationService } from '../application/service';
import { createState, MemoryRepository } from '../application/repository';
import { AppError } from '../domain/errors';
import type { Context, Seed } from '../domain/types';
import type { Client, FaultMode } from './types';
export function createMemoryClient(input: unknown = fixture): Client {
  const seed = input as Seed;
  const service = new ApplicationService(new MemoryRepository(createState(seed)), seed);
  let context: Context = {
    actorId: seed.actors.find((actor) => actor.role === 'agent')!.id,
    sessionId: crypto.randomUUID(),
  };
  let fault: FaultMode = 'none';
  return {
    async me() {
      return service.me(context);
    },
    async setActor(role) {
      const actor = seed.actors.find((item) => item.role === role && item.active);
      if (!actor) throw new AppError(422, 'INVALID_ROLE', 'Synthetische Rolle nicht verfügbar.');
      context = { actorId: actor.id, sessionId: crypto.randomUUID() };
      return service.me(context);
    },
    async listCalls() {
      return service.listCalls(context);
    },
    async getCall(id) {
      return service.getCall(context, id);
    },
    async saveDraft(id, value, version, key) {
      return service.saveDraft(context, id, value, version, key);
    },
    async submit(id, value, version, key) {
      const selected = fault;
      fault = 'none';
      if (selected === 'before')
        throw new AppError(
          503,
          'SIMULATED_BEFORE_COMMIT',
          'Simulierter Fehler vor dem Speichern. Eingaben bleiben erhalten. Erneut versuchen.',
        );
      const call = service.submit(context, id, value, version, key);
      if (selected === 'after')
        throw new AppError(
          504,
          'SIMULATED_RESPONSE_LOST',
          'Simulierter Antwortverlust. Speicherstatus ist unklar. Dieselbe Anfrage erneut versuchen.',
        );
      return call;
    },
    async assign(id, agentId, version, key) {
      return service.assign(context, id, agentId, version, key);
    },
    async report(from, until) {
      return service.report(context, from, until);
    },
    async exportCsv(token) {
      return service.exportCsv(context, token);
    },
    async reset() {
      service.reset();
      fault = 'none';
      context = {
        actorId: seed.actors.find((actor) => actor.role === 'agent')!.id,
        sessionId: crypto.randomUUID(),
      };
    },
    async replayCall(id) {
      service.replayCall(context, id);
    },
    async newCall() {
      return service.newCall(context);
    },
    setFault(mode) {
      fault = mode;
    },
  };
}

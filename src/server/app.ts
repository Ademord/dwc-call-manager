import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fixture from '../../demo/seed.json';
import { catalog } from '../domain/catalog';
import { AppError, fail } from '../domain/errors';
import { ApplicationService } from '../application/service';
import { createState, MemoryRepository, type Repository } from '../application/repository';
import type { Context, Seed } from '../domain/types';

interface Session extends Context {
  expires: number;
}
export interface ServerOptions {
  repository?: Repository;
  seed?: Seed;
  distPath?: string;
  allowedOrigins?: string[];
}
export async function createServer(options: ServerOptions = {}) {
  const seed = options.seed ?? (fixture as Seed);
  const service = new ApplicationService(
    options.repository ?? new MemoryRepository(createState(seed)),
    seed,
  );
  const app = Fastify({ logger: false, bodyLimit: 16384, trustProxy: false });
  const sessions = new Map<string, Session>();
  const allowedOrigins = new Set(
    options.allowedOrigins ?? [
      'http://127.0.0.1:4317',
      'http://localhost:4317',
      'http://127.0.0.1:4318',
      'http://localhost:4318',
    ],
  );
  function newSession(reply: FastifyReply, role = 'agent'): Session {
    for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
    if (sessions.size >= 100) sessions.delete(sessions.keys().next().value!);
    const actor =
      seed.actors.find((actor) => actor.role === role && actor.active) ??
      fail(422, 'INVALID_ROLE', 'Synthetische Rolle nicht verfügbar.');
    const sessionId = crypto.randomUUID();
    const session = { sessionId, actorId: actor.id, expires: Date.now() + 8 * 60 * 60 * 1000 };
    sessions.set(sessionId, session);
    reply.header(
      'Set-Cookie',
      `dwc_synthetic=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`,
    );
    return session;
  }
  function sessionFor(request: FastifyRequest): Session {
    const token = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('dwc_synthetic='))
      ?.slice('dwc_synthetic='.length);
    const session = token ? sessions.get(token) : undefined;
    if (!session || session.expires <= Date.now())
      fail(
        401,
        'SESSION_REQUIRED',
        'Synthetische Sitzung fehlt oder ist abgelaufen. Bitte neu laden.',
      );
    return session;
  }
  function commandHeaders(request: FastifyRequest): { version: number; key: string } {
    const match = request.headers['if-match'];
    if (!match) fail(428, 'VERSION_REQUIRED', 'If-Match ist erforderlich.');
    if (typeof match !== 'string' || !/^"\d+"$/.test(match))
      fail(
        400,
        'INVALID_VERSION',
        'If-Match muss eine Datensatzversion in Anführungszeichen enthalten.',
      );
    return {
      version: Number(match.slice(1, -1)),
      key: String(request.headers['idempotency-key'] ?? ''),
    };
  }
  const idOf = (request: FastifyRequest) => (request.params as { id: string }).id;
  const sendCall = (reply: FastifyReply, call: { recordVersion: number }) =>
    reply.header('ETag', `"${call.recordVersion}"`).send(call);
  function exactBody(request: FastifyRequest, keys: string[]): Record<string, unknown> {
    const body = request.body;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== keys.length ||
      keys.some((key) => !(key in body))
    )
      fail(400, 'INVALID_SHAPE', 'Ungültige Anfragefelder.');
    return body as Record<string, unknown>;
  }
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError)
      return reply
        .code(error.status)
        .send({ code: error.code, message: error.message, details: error.details });
    const status =
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    return reply.code(status).send({
      code: status < 500 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR',
      message:
        status < 500
          ? 'Ungültige Anfrage an den lokalen Dienst.'
          : 'Lokaler Speicherfehler. Eingaben behalten und Dienst prüfen.',
    });
  });
  app.addHook('onRequest', async (request, reply) => {
    // Loopback binding plus host/origin validation blocks DNS rebinding and remote pages.
    const host = request.headers.host;
    if (!host || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host))
      fail(403, 'LOCAL_ONLY', 'Dieser synthetische Prototyp ist nur lokal verfügbar.');
    reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'no-referrer');
    if (request.url.startsWith('/api/')) {
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.has(origin))
        fail(
          403,
          'ORIGIN_REJECTED',
          'Nur die lokale Prototyp-Oberfläche darf diese API verwenden.',
        );
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
        request.headers['x-dwc-local'] !== '1'
      )
        fail(403, 'LOCAL_HEADER_REQUIRED', 'Lokaler Anfragekontext fehlt.');
    }
  });
  app.get('/api/me', async (request, reply) => {
    let context: Session;
    try {
      context = sessionFor(request);
    } catch {
      context = newSession(reply);
    }
    return service.me(context);
  });
  app.get('/api/catalog', async (request) => {
    service.me(sessionFor(request));
    return catalog;
  });
  app.get('/api/agents', async (request) => service.agents(sessionFor(request)));
  app.get('/api/calls', async (request) => {
    if (Object.keys(request.query as object).length)
      fail(
        400,
        'UNSUPPORTED_QUERY',
        'Der begrenzte lokale Prototyp liefert die vollständige berechtigte Anrufliste.',
      );
    return service.listCalls(sessionFor(request));
  });
  app.get('/api/calls/:id', async (request, reply) =>
    sendCall(reply, service.getCall(sessionFor(request), idOf(request))),
  );
  app.put('/api/calls/:id/draft', async (request, reply) => {
    const context = sessionFor(request),
      { version, key } = commandHeaders(request);
    return sendCall(reply, service.saveDraft(context, idOf(request), request.body, version, key));
  });
  app.post('/api/calls/:id/submit', async (request, reply) => {
    const context = sessionFor(request),
      { version, key } = commandHeaders(request);
    return sendCall(reply, service.submit(context, idOf(request), request.body, version, key));
  });
  app.patch('/api/calls/:id/assignment', async (request, reply) => {
    const context = sessionFor(request),
      { version, key } = commandHeaders(request),
      body = exactBody(request, ['agentId']);
    if (typeof body.agentId !== 'string') fail(400, 'INVALID_SHAPE', 'Ungültige Mitarbeiter-ID.');
    return sendCall(reply, service.assign(context, idOf(request), body.agentId, version, key));
  });
  app.get('/api/reports/summary', async (request) => {
    const query = request.query as Record<string, string>;
    if (Object.keys(query).some((key) => !['from', 'until'].includes(key)))
      fail(400, 'UNSUPPORTED_QUERY', 'Nur von/bis sind als Berichtsfilter unterstützt.');
    return service.report(sessionFor(request), query.from, query.until);
  });
  app.post('/api/reports/export', async (request, reply) => {
    const context = sessionFor(request),
      body = exactBody(request, ['snapshotToken']);
    if (typeof body.snapshotToken !== 'string')
      fail(400, 'INVALID_SHAPE', 'Berichtsschlüssel fehlt.');
    const { csv, report } = service.exportSnapshot(context, body.snapshotToken);
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="dwc-synthetic-${report.from}-${report.until}.csv"`,
      )
      .header('X-Report-Timezone', report.timezone)
      .header('X-Report-Generated-At', report.generatedAt)
      .header('X-Report-From', report.from)
      .header('X-Report-Until', report.until)
      .send(csv);
  });
  app.post('/api/demo/actor', async (request, reply) => {
    const old = sessionFor(request),
      body = exactBody(request, ['role']);
    if (body.role !== 'agent' && body.role !== 'manager')
      fail(422, 'INVALID_ROLE', 'Synthetische Rolle nicht verfügbar.');
    sessions.delete(old.sessionId);
    return service.me(newSession(reply, body.role));
  });
  app.post('/api/demo/reset', async (request, reply) => {
    sessionFor(request);
    exactBody(request, []);
    service.reset();
    sessions.clear();
    newSession(reply);
    return reply.code(204).send();
  });
  app.post('/api/demo/replay', async (request, reply) => {
    const context = sessionFor(request),
      body = exactBody(request, ['id']);
    if (typeof body.id !== 'string') fail(400, 'INVALID_SHAPE', 'Anruf-ID fehlt.');
    service.replayCall(context, body.id);
    return reply.code(204).send();
  });
  app.post('/api/demo/new-call', async (request, reply) => {
    const context = sessionFor(request);
    exactBody(request, []);
    return sendCall(reply, service.newCall(context));
  });
  app.get('/api/integrations/status', async (request) => {
    service.agents(sessionFor(request));
    return {
      mode: 'synthetic',
      completeness: 'unverified',
      message: 'Keine Telefonie verbunden. Nur synthetische Ereignisse.',
    };
  });
  if (options.distPath && existsSync(resolve(options.distPath, 'index.html')))
    await app.register(fastifyStatic, { root: resolve(options.distPath), prefix: '/' });
  app.addHook('onClose', async () => {
    sessions.clear();
  });
  return app;
}

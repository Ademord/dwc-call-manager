import { AppError } from '../domain/errors';
import type { Client, FaultMode } from './types';
export function createHttpClient(baseUrl = ''): Client {
  let fault: FaultMode = 'none';
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        credentials: 'same-origin',
        ...options,
        headers: { 'Content-Type': 'application/json', 'X-DWC-Local': '1', ...options.headers },
      });
    } catch {
      throw new AppError(
        0,
        'NETWORK_ERROR',
        'Lokaler Dienst nicht erreichbar. Eingaben bleiben erhalten. Dieselbe Anfrage erneut versuchen.',
      );
    }
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ code: 'HTTP_ERROR', message: 'Lokaler Dienst meldet einen Fehler.' }));
      throw new AppError(response.status, error.code, error.message, error.details);
    }
    if (response.status === 204) return undefined as T;
    if (response.headers.get('content-type')?.includes('text/csv'))
      return (await response.text()) as T;
    return (await response.json()) as T;
  }
  const mutation = <T>(path: string, method: string, body: unknown, version: number, key: string) =>
    request<T>(path, {
      method,
      body: JSON.stringify(body),
      headers: { 'If-Match': `"${version}"`, 'Idempotency-Key': key },
    });
  return {
    me: () => request('/api/me'),
    setActor: (role) =>
      request('/api/demo/actor', { method: 'POST', body: JSON.stringify({ role }) }),
    listCalls: () => request('/api/calls'),
    getCall: (id) => request(`/api/calls/${encodeURIComponent(id)}`),
    saveDraft: (id, value, version, key) =>
      mutation(`/api/calls/${encodeURIComponent(id)}/draft`, 'PUT', value, version, key),
    async submit(id, value, version, key) {
      const selected = fault;
      fault = 'none';
      if (selected === 'before')
        throw new AppError(
          503,
          'SIMULATED_BEFORE_COMMIT',
          'Simulierter Fehler vor dem Speichern. Erneut versuchen.',
        );
      const call = await mutation<Awaited<ReturnType<Client['submit']>>>(
        `/api/calls/${encodeURIComponent(id)}/submit`,
        'POST',
        value,
        version,
        key,
      );
      if (selected === 'after')
        throw new AppError(
          504,
          'SIMULATED_RESPONSE_LOST',
          'Simulierter Antwortverlust. Speicherstatus ist unklar. Dieselbe Anfrage erneut versuchen.',
        );
      return call;
    },
    assign: (id, agentId, version, key) =>
      mutation(
        `/api/calls/${encodeURIComponent(id)}/assignment`,
        'PATCH',
        { agentId },
        version,
        key,
      ),
    report: (from, until) =>
      request(
        `/api/reports/summary?from=${encodeURIComponent(from)}&until=${encodeURIComponent(until)}`,
      ),
    exportCsv: (snapshotToken) =>
      request('/api/reports/export', { method: 'POST', body: JSON.stringify({ snapshotToken }) }),
    async reset() {
      await request('/api/demo/reset', { method: 'POST', body: '{}' });
      fault = 'none';
    },
    replayCall: (id) =>
      request('/api/demo/replay', { method: 'POST', body: JSON.stringify({ id }) }),
    newCall: () => request('/api/demo/new-call', { method: 'POST', body: '{}' }),
    setFault(mode) {
      fault = mode;
    },
  };
}

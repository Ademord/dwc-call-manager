import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Repository, State } from '../application/repository';

/** Atomic single-document persistence for the local synthetic prototype only.
 * Not the proposed normalized PostgreSQL schema, a migration, or a live adapter.
 */
export class SqliteRepository implements Repository {
  private readonly db: DatabaseSync;
  constructor(path: string, initial: State) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS prototype_state (id INTEGER PRIMARY KEY CHECK(id = 1), schema_version INTEGER NOT NULL CHECK(schema_version = 1), payload TEXT NOT NULL);',
    );
    this.db
      .prepare('INSERT OR IGNORE INTO prototype_state(id, schema_version, payload) VALUES(1, 1, ?)')
      .run(JSON.stringify(initial));
    this.read();
  }
  read(): State {
    const row = this.db
      .prepare('SELECT schema_version, payload FROM prototype_state WHERE id = 1')
      .get() as { schema_version: number; payload: string } | undefined;
    if (!row || row.schema_version !== 1)
      throw new Error(
        'Unsupported or missing local prototype snapshot. Restore a known backup; no automatic reset was performed.',
      );
    const state = JSON.parse(row.payload) as State;
    if (
      state.schemaVersion !== 1 ||
      !Array.isArray(state.calls) ||
      !Array.isArray(state.receipts) ||
      !Array.isArray(state.events) ||
      !Array.isArray(state.actors) ||
      !Array.isArray(state.assignments) ||
      !Array.isArray(state.canonicalEvents) ||
      !Number.isSafeInteger(state.sequence)
    )
      throw new Error('Invalid local prototype snapshot. No automatic reset was performed.');
    return state;
  }
  transact<T>(work: (state: State) => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const candidate = this.read();
      const result = work(candidate);
      this.db
        .prepare('UPDATE prototype_state SET payload = ? WHERE id = 1')
        .run(JSON.stringify(candidate));
      this.db.exec('COMMIT');
      return structuredClone(result);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  reset(state: State): void {
    this.transact((candidate) => {
      Object.assign(candidate, structuredClone(state));
    });
  }
  async backupTo(path: string): Promise<void> {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    await backup(this.db, path);
  }
  close(): void {
    this.db.close();
  }
}

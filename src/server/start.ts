import { resolve } from 'node:path';
import fixture from '../../demo/seed.json';
import type { Seed } from '../domain/types';
import { createState } from '../application/repository';
import { createServer } from './app';
import { SqliteRepository } from './sqlite';

const port = Number(process.env.PORT ?? 4318);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be an integer between 1024 and 65535.');
const repository = new SqliteRepository(
  resolve(process.env.DWC_DB_PATH ?? 'work/local-prototype.sqlite'),
  createState(fixture as Seed),
);
const app = await createServer({
  repository,
  distPath: resolve('dist'),
  allowedOrigins: [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    'http://127.0.0.1:4317',
    'http://localhost:4317',
  ],
});
app.addHook('onClose', async () => repository.close());
const address = await app.listen({ host: '127.0.0.1', port });
console.log(
  `DWC LOCAL SYNTHETIC prototype: ${address}. SQLite persistence; no real identity or telephony.`,
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });

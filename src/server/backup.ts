import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fixture from '../../demo/seed.json';
import type { Seed } from '../domain/types';
import { createState } from '../application/repository';
import { SqliteRepository } from './sqlite';
const source = resolve(process.env.DWC_DB_PATH ?? 'work/local-prototype.sqlite');
const destinationArg = process.argv[2];
if (!destinationArg)
  throw new Error('Usage: npm run backup:local -- work/backups/synthetic.sqlite');
const destination = resolve(destinationArg);
if (!existsSync(source))
  throw new Error('No existing local database to back up. Start the prototype first.');
if (source === destination || existsSync(destination))
  throw new Error('Choose a new destination path; existing files are never overwritten.');
const repository = new SqliteRepository(source, createState(fixture as Seed));
try {
  await repository.backupTo(destination);
  console.log(`Consistent synthetic SQLite backup saved to ${destination}`);
} finally {
  repository.close();
}

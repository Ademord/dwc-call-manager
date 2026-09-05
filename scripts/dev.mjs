import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const processes = [
  spawn(process.execPath, ['--import', 'tsx', 'src/server/start.ts'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '4318' },
    windowsHide: true,
  }),
  spawn(
    process.execPath,
    [
      join(dirname(require.resolve('vite/package.json')), 'bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '4317',
      '--strictPort',
    ],
    { stdio: 'inherit', windowsHide: true },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const child of processes) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}

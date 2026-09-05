import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const result = await build({
  entryPoints: ['src/demo.tsx'],
  bundle: true,
  write: false,
  outdir: 'demo/dist',
  format: 'iife',
  platform: 'browser',
  target: ['chrome110', 'edge110', 'safari16.4'],
  minify: true,
  legalComments: 'inline',
  define: { 'process.env.NODE_ENV': '"production"' },
  metafile: true,
});
const js = result.outputFiles.find((file) => file.path.endsWith('.js'))?.text;
const css = result.outputFiles.find((file) => file.path.endsWith('.css'))?.text;
if (!js || !css) throw new Error('Expected one JavaScript and one CSS bundle.');
if (
  Object.keys(result.metafile.inputs).some((path) => /src\/server\/|src\/client\/http/.test(path))
)
  throw new Error('Portable demo must not include HTTP/server adapters.');
const notices = (await readFile('THIRD_PARTY_NOTICES.md', 'utf8')).replace(/-->/g, '--&gt;');
const html = `<!doctype html>\n<!--\n${notices}\n-->\n<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#163367"><meta name="description" content="DWC Call Manager – portable Demo mit synthetischen Daten. Funktioniert ohne Konto und Netzwerk."><title>DWC Manager · Portable Demo</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>\n`;
if (/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i.test(html))
  throw new Error('External resource in portable demo.');
await mkdir('demo/dist', { recursive: true });
await writeFile('demo/dist/index.html', html);
await mkdir('dist', { recursive: true });
await writeFile('dist/demo.html', html);
await writeFile(
  'demo/dist/build-info.json',
  JSON.stringify(
    {
      artifact: 'index.html',
      sha256: createHash('sha256').update(html).digest('hex'),
      bytes: Buffer.byteLength(html),
      sourceEntry: 'src/demo.tsx',
      bundledModules: Object.keys(result.metafile.inputs).length,
      networkDependencies: 0,
      scope: 'synthetic portable prototype; in-memory data resets on reload',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Portable demo built: ${resolve('demo/dist/index.html')} (${Buffer.byteLength(html)} bytes)`,
);

import { build } from 'esbuild';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function findTs(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...findTs(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

const srcFiles = findTs('src');

await build({
  entryPoints: srcFiles,
  bundle: false,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outdir: 'dist',
  outbase: 'src',
  sourcemap: true,
});

console.log('Build complete:', srcFiles.length, 'files');

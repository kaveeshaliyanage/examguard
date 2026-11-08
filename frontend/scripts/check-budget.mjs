import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const TOTAL_BUDGET_BYTES = 420 * 1024;
const CHUNK_BUDGET_BYTES = 220 * 1024;

const assetsDir = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const chunks = readdirSync(assetsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({
    name,
    gzipBytes: gzipSync(readFileSync(join(assetsDir, name))).length,
  }))
  .sort((left, right) => right.gzipBytes - left.gzipBytes);

const total = chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
const oversized = chunks.filter((chunk) => chunk.gzipBytes > CHUNK_BUDGET_BYTES);

for (const chunk of chunks) {
  console.log(`${(chunk.gzipBytes / 1024).toFixed(1).padStart(7)} kB gzip  ${chunk.name}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(7)} kB gzip  total (budget ${TOTAL_BUDGET_BYTES / 1024} kB)`);

if (total > TOTAL_BUDGET_BYTES || oversized.length > 0) {
  for (const chunk of oversized) {
    console.error(`chunk ${chunk.name} exceeds the ${CHUNK_BUDGET_BYTES / 1024} kB gzip budget`);
  }
  if (total > TOTAL_BUDGET_BYTES) {
    console.error(`total bundle exceeds the ${TOTAL_BUDGET_BYTES / 1024} kB gzip budget`);
  }
  process.exit(1);
}

/**
 * Run unit + live tests.
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

function run(script) {
  console.log(`\n—— ${script} ——\n`);
  const r = spawnSync(process.execPath, [join(__dir, script)], {
    cwd: root,
    stdio: 'inherit',
  });
  return r.status ?? 1;
}

let code = run('test-combat.mjs');
if (code !== 0) process.exit(code);
code = run('test-integration.mjs');
process.exit(code);

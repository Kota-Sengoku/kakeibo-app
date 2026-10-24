// すべてのテストを順番に動かして、失敗(FAIL)があれば、終了コード1で終わる。
//   使い方:  node tests/run-all.mjs        (Node.js 22.5 以上が必要)
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort();
let failed = 0, passed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--no-warnings', path.join(dir, f)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter((l) => /^FAIL/.test(l) || /Error/.test(l));
  const oks = out.split('\n').filter((l) => /^PASS/.test(l)).length;
  passed += oks;
  if (fails.length || r.status) { failed += Math.max(1, fails.length); console.log(`✗ ${f}`); fails.slice(0, 8).forEach((l) => console.log('    ' + l)); }
  else console.log(`✓ ${f}  (${oks}件)`);
}
console.log(failed ? `\n失敗 ${failed}件` : `\nすべて合格(${passed}件)`);
process.exit(failed ? 1 : 0);

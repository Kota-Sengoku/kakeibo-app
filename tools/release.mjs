// src/ の中身を、公開用の場所にコピーする。
//   node tools/release.mjs beta     → /beta/ にだけ出す(自分だけが確認する。友達のアプリには反映されない)
//   node tools/release.mjs stable   → 全員に出す(ルート。友達のアプリは、次に開いたときに自動で最新になる)
//
// ・コピーしたあと、git で commit して push すると、GitHub Pages に反映されます。
// ・betaとstableは、同じブラウザの保存領域(データ)を共有します。beta で動かしたあとも、データは同じものが見えます。
// ・Workerの更新を、友達に「案内する」かどうかは、src/release.json の worker(最新の版)と workerMin(必須の版)で決まります。
//     worker を上げる → 設定に「更新があります(任意)」と出る
//     workerMin も上げる → 「更新が必要です」と出る
//     どちらも上げない → 案内は出ない(アプリだけが新しくなる)
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!['beta', 'stable'].includes(target)) {
  console.error('使い方: node tools/release.mjs beta | stable');
  process.exit(1);
}
const FILES = ['index.html', 'sw.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon.svg', 'worker.js', 'mail.gs', 'release.json'];
const dest = target === 'beta' ? path.join(root, 'beta') : root;
mkdirSync(dest, { recursive: true });
for (const f of FILES) copyFileSync(path.join(root, 'src', f), path.join(dest, f));
const rel = JSON.parse(readFileSync(path.join(root, 'src', 'release.json'), 'utf8'));
console.log(`${target === 'beta' ? 'ベータ版(/beta/)' : '安定版(全員)'} に、${FILES.length}個のファイルをコピーしました。`);
console.log(`お知らせ id=${rel.id} / Workerの最新の版=${rel.worker} / 必須の版=${rel.workerMin}`);
console.log('次に、git add -A → git commit → git push で、公開されます。');

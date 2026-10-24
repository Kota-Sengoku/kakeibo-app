import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'url';
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) process.exitCode = 1; };
const worker = (await import(new URL('../src/worker.js', import.meta.url).href)).default;

/* D1のふりをする(Node の SQLite で、D1と同じ使い方をできるようにする) */
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  let calls = 0;
  const mk = (sql, params = []) => ({
    bind: (...p) => mk(sql, p),
    all: async () => { calls++; if (params.length > 100) throw new Error('too many SQL variables'); return { results: db.prepare(sql).all(...params), meta: {} }; },
    first: async () => { calls++; return db.prepare(sql).get(...params) || null; },
    run: async () => { calls++; if (params.length > 100) throw new Error('too many SQL variables'); const r = db.prepare(sql).run(...params); return { meta: { changes: r.changes } }; },
    _exec: () => { if (params.length > 100) throw new Error('too many SQL variables'); const r = db.prepare(sql).run(...params); return { results: [], meta: { changes: r.changes } }; },
  });
  return { prepare: (sql) => mk(sql), batch: async (stmts) => { calls++; return stmts.map((s) => s._exec()); }, get calls() { return calls; }, resetCalls() { calls = 0; }, raw: db };
}
const DB = fakeD1();
const env = { APP_KEY: 'k'.repeat(30), BACKEND: 'd1', DB };
const call = async (method, path, body, e = env) => {
  const res = await worker.fetch(new Request('https://w.example' + path, { method, headers: { 'X-App-Key': 'k'.repeat(30), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), e);
  return { status: res.status, body: await res.json() };
};
const rec = (id, m, v, extra = {}) => ({ id, date: '2026/10/10 12:00:00', amount: String(Math.abs(v)), amount_value: v, merchant: m, transaction_type: '支払い', status: 'confirmed', source: 'paypay_csv', raw: '', ...extra });

// ============ 攻撃テスト(Worker側) ============
const KEY = env.APP_KEY;
const raw = async (method, path, headers = {}, body, e = env) => {
  const t0 = Date.now();
  const res = await worker.fetch(new Request('https://w.example' + path, { method, headers, body }), e);
  let b = null; try { b = await res.clone().json(); } catch (_) {}
  return { status: res.status, body: b, ms: Date.now() - t0, res };
};
let ipn = 0; const ip = () => '10.0.' + (ipn >> 8) + '.' + (ipn++ & 255);
const full = (extra = {}) => ({ 'X-App-Key': KEY, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip(), ...extra });
const none = (extra = {}) => ({ 'Content-Type': 'application/json', 'CF-Connecting-IP': ip(), ...extra });
let r;

// 1) 合言葉なし・間違いでの、すべての入口
const ROUTES = [['GET', '/api/transactions'], ['GET', '/api/settings'], ['GET', '/api/info'], ['POST', '/api/settings'], ['POST', '/api/apply'], ['POST', '/api/import'], ['POST', '/api/migrate'], ['POST', '/api/ingest'], ['POST', '/api/mail'], ['GET', '/'], ['GET', '/api/nothing'], ['DELETE', '/api/transactions'], ['PUT', '/api/apply'], ['GET', '/api/../api/info'], ['GET', '/api/info/'], ['GET', '//api//info']];
let open = [];
for (const [m, p] of ROUTES) for (const h of [none(), none({ 'X-App-Key': '' }), none({ 'X-App-Key': 'x' }), none({ 'X-App-Key': KEY + 'x' }), none({ 'X-App-Key': KEY.slice(0, -1) }), none({ 'X-App-Key': KEY.toUpperCase() })]) {
  const rr = await raw(m, p, h, m === 'GET' ? undefined : '{}');
  if (rr.status === 200 || rr.status === 204) open.push(`${m} ${p} → ${rr.status}`);
}
ok(open.length === 0, '攻撃(認証): 合言葉なし・間違い・1文字違い・大文字小文字違いで、どの入口も、開かない ' + (open.length ? JSON.stringify(open.slice(0, 4)) : ''));
let leakBody = [];
for (const [m, p] of ROUTES.slice(0, 9)) { const rr = await raw(m, p, none({ 'X-App-Key': 'x' }), m === 'GET' ? undefined : '{}'); if (JSON.stringify(rr.body || {}).match(/D1|SELECT|stack|at .*\(/i)) leakBody.push(p); }
ok(leakBody.length === 0, '攻撃(情報): 認証に失敗したときの返事に、内部の情報(SQL・場所・スタック)が含まれない');

// 2) 書き込み専用の鍵で、できないこと(読み出し・消去・設定・移行)
const enc = new TextEncoder();
const hk = await crypto.subtle.importKey('raw', enc.encode(KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const IK = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', hk, enc.encode('kakeibo-ingest-v1')))).map((b) => b.toString(16).padStart(2, '0')).join('');
let ingestOpen = [];
for (const [m, p] of ROUTES.filter(([, pp]) => !['/api/ingest', '/api/mail'].includes(pp))) { const rr = await raw(m, p, none({ 'X-App-Key': IK }), m === 'GET' ? undefined : '{}'); if (rr.status === 200) ingestOpen.push(m + ' ' + p); }
ok(ingestOpen.length === 0, '攻撃(権限): 書き込み専用の鍵では、取り込み以外の入口は、すべて開かない');
await raw('POST', '/api/import', full(), JSON.stringify([{ id: 'victim1', merchant: 'もとの店名', amount_value: -100, date: '2026/10/24 10:00:00', source: 'paypay_csv' }]));
await raw('POST', '/api/ingest', none({ 'X-App-Key': IK }), JSON.stringify({ id: 'victim1', raw: 'のっとり\n2026年10月24日10時00分\n999円の\n支払い完了', captured_at: '2026-10-24 10:00:00' }));
await raw('POST', '/api/mail', none({ 'X-App-Key': IK }), JSON.stringify({ id: 'victim1', from: 'a@vpass.ne.jp', subject: 'ご利用のお知らせ', body: 'ご利用日時：2026/10/24 10:00\nご利用金額：999円\nご利用先：のっとり' }));
const vic = (await raw('GET', '/api/transactions', full())).body.records.find((x) => x.id === 'victim1');
ok(vic && vic.merchant === 'もとの店名' && vic.amount_value === -100, '攻撃(上書き): 書き込み専用の鍵で、同じIDを送っても、すでにある取引は、書き換わらない');

// 3) おかしな形のデータで、サーバーが、壊れない・内部を漏らさない
const WEIRD = ['null', '[]', '123', '"str"', 'true', '{', '', '{"edits":null,"deleted":null,"added":null}', '{"edits":[],"deleted":"abc","added":{}}', '{"edits":{"a":null,"b":5,"c":"x"}}', '[null,1,"a",[],{}]', '{"learned":"x","budgets":[]}', '{"__proto__":{"polluted":1}}', '{"constructor":{"prototype":{"polluted":1}}}'];
let crashes = [];
for (const p of ['/api/apply', '/api/import', '/api/settings', '/api/ingest', '/api/mail']) for (const b of WEIRD) {
  const rr = await raw('POST', p, full(), b);
  if (rr.status >= 500 && /Cannot|undefined|TypeError|ReferenceError|JSON|Unexpected|at \w+/.test(JSON.stringify(rr.body))) crashes.push(`${p} ${b.slice(0, 20)} → ${JSON.stringify(rr.body).slice(0, 70)}`);
  if (![200, 400, 429, 500].includes(rr.status)) crashes.push(`${p} ${b} → status ${rr.status}`);
}
ok(crashes.length === 0, '攻撃(おかしなデータ): 変な形のデータを送っても、内部のエラーの文面は、返らない ' + (crashes.length ? JSON.stringify(crashes.slice(0, 3)) : ''));
ok(({}).polluted === undefined, '攻撃(汚染): __proto__ / constructor を送っても、サーバー全体に影響しない');
const st = (await raw('GET', '/api/settings', full())).body;
ok(st && !Object.prototype.hasOwnProperty.call(st, 'polluted') && !(st.constructor && st.constructor.prototype && st.constructor.prototype.polluted), '攻撃(汚染): 保存された設定に、汚染の印が入らない');

// 4) SQL・検索の入力
const SQLI = ["' OR 1=1 --", "'; DROP TABLE tx; --", '" OR ""="', '%', '\\', '\u0000', "1|' OR '1'='1", '|||', 'x'.repeat(5000)];
let sqlBad = [];
for (const v of SQLI) {
  for (const q of ['since', 'cursor']) { const rr = await raw('GET', '/api/transactions?' + q + '=' + encodeURIComponent(v), full()); if (rr.status >= 500 && /SQL|syntax|sqlite/i.test(JSON.stringify(rr.body))) sqlBad.push(q + ':' + v.slice(0, 10)); }
  const r2 = await raw('POST', '/api/apply', full(), JSON.stringify({ edits: { [v]: { merchant: v, category: v } }, deleted: [v], added: [{ id: v, merchant: v }] }));
  if (r2.status >= 500 && /SQL|syntax|sqlite/i.test(JSON.stringify(r2.body))) sqlBad.push('apply:' + v.slice(0, 10));
}
const cnt = (await raw('GET', '/api/info', full())).body;
ok(sqlBad.length === 0 && cnt.rows > 0, '攻撃(SQL): 検索・ID・店名に、SQLの文を入れても、実行されない・テーブルが消えない(取引は ' + cnt.rows + '件のまま)');
r = await raw('POST', '/api/apply', full(), JSON.stringify({ edits: { victim1: { merchant: '編集OK', deleted: 1, id: 'other', updated_at: 'x', data: '{}', 'x"; DROP': 1 } } }));
const vic2 = (await raw('GET', '/api/transactions', full())).body.records.find((x) => x.id === 'victim1');
ok(vic2 && vic2.merchant === '編集OK' && vic2.id === 'victim1' && !('deleted' in vic2) && !('data' in vic2) && !('x"; DROP' in vic2), '攻撃(項目の乗っ取り): 編集で、id・削除の印・内部の列・決まっていない項目は、書き換えられない');

// 5) 重い入力で、固まらない(正規表現の暴走・巨大な本文)
const heavy = [
  ['/api/mail', { id: 'h1', from: 'a@vpass.ne.jp', subject: 'ご利用のお知らせ', body: '【ご利用日時】2026年10月24日 12:34 【ご利用金額】1 円 【ご利用先】' + ' '.repeat(900000) + 'x' }],
  ['/api/mail', { id: 'h2', from: 'a@vpass.ne.jp', subject: 'ご利用のお知らせ', body: 'ご利用日時：' + '2026/'.repeat(100000) }],
  ['/api/mail', { id: 'h3', from: 'a@vpass.ne.jp', subject: 'ご利用のお知らせ', body: ('ご利用先：' + 'あ'.repeat(1000) + '\n').repeat(900) }],
  ['/api/ingest', { raw: '9:41\n' + ('ガスト\n').repeat(100000) + '2026年10月24日10時00分\n100円の\n支払い完了' }],
  ['/api/ingest', { raw: '1'.repeat(900000) + '円' }],
  ['/api/ingest', { raw: ('1,'.repeat(300000)) + '円' }],
];
let slow = [];
for (const [p, b] of heavy) { const rr = await raw('POST', p, full(), JSON.stringify(b)); if (rr.ms > 1500) slow.push(`${p} ${rr.ms}ms`); }
ok(slow.length === 0, '攻撃(重い入力): 長い・同じ文字が続く・正規表現を暴走させる文を送っても、1.5秒以内に終わる ' + (slow.length ? JSON.stringify(slow) : ''));

// 6) 洪水(書き込み専用の鍵で、データベースを埋める)
let floodStatus = [];
for (let i = 0; i < 1100; i++) { const rr = await raw('POST', '/api/ingest', none({ 'X-App-Key': IK, 'CF-Connecting-IP': '5.5.5.5' }), JSON.stringify({ raw: `洪水${i}\n2026年10月24日10時00分\n1円の\n支払い完了`, captured_at: '2026-10-24 10:00:' + i })); floodStatus.push(rr.status); if (rr.status === 429) break; }
ok(floodStatus.includes(429), '攻撃(洪水): 書き込み専用の鍵で、1時間に1,000件を超えて送ると、断られる(' + floodStatus.length + '件目で停止)');
r = await raw('GET', '/api/info', full());
ok(r.status === 200, '攻撃(洪水): 洪水のあとも、正しい合言葉のアプリは、これまでどおり使える');

// 7) CORS
r = await raw('OPTIONS', '/api/transactions', { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' });
ok(r.status === 204 && !r.res.headers.get('Set-Cookie'), '確認(CORS): 事前確認はクッキーを使わない(鍵は、ヘッダで渡す形なので、他のサイトから勝手には呼べない)');

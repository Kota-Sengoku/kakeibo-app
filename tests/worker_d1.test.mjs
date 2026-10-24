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

let r = await call('GET', '//api/info');
ok(r.body.backend === 'd1' && r.body.d1 === true && r.body.rows === 0, 'D1: 状態の確認で、保存先が d1、取引は0件');
r = await call('POST', '/api/import', [rec('a1', 'ライフ', -1000), rec('a2', 'ガスト', -2413), rec('a3', 'Netflix', -1490)]);
ok(r.body.added === 3 && r.body.skipped === 0, 'D1: 3件を追加できる');
r = await call('POST', '/api/import', [rec('a1', 'ライフ', -1000), rec('a4', '新しい店', -300)]);
ok(r.body.added === 1 && r.body.skipped === 1, 'D1: 同じIDは、二重にならない(追加1・スキップ1)');
r = await call('GET', '/api/transactions');
ok(r.body.records.length === 4 && r.body.next === null && r.body.records.every((x) => x.id && x.merchant), 'D1: 全件を取得できる');
const t0 = r.body.server_time;
// 編集・削除
await new Promise((x) => setTimeout(x, 5));
r = await call('POST', '/api/apply', { edits: { a2: { category: '食費', merchant: 'ガスト上大岡' } }, deleted: ['a3'], added: [rec('a5', '手入力', -500, { source: 'manual' })] });
ok(r.body.edited === 1 && r.body.deleted === 1 && r.body.added === 1, 'D1: 編集1・削除1・追加1を反映できる');
r = await call('GET', '/api/transactions');
const m = Object.fromEntries(r.body.records.map((x) => [x.id, x]));
ok(r.body.records.length === 4 && !m.a3 && m.a2.category === '食費' && m.a2.merchant === 'ガスト上大岡' && m.a2.raw === '' && m.a5, 'D1: 編集が反映され、削除した取引は全件取得から消える');
r = await call('GET', '/api/transactions?since=' + encodeURIComponent(t0));
const ms = Object.fromEntries(r.body.records.map((x) => [x.id, x]));
ok(ms.a3 && ms.a3.deleted === true && ms.a2.category === '食費' && ms.a5 && !ms.a1, 'D1: 差分の取得で、変更・追加・削除(deleted:true)だけが返る');
// 設定
r = await call('POST', '/api/settings', { learned: { 'ライフ': '食費' }, budgets: { 食費: 30000 } });
r = await call('POST', '/api/settings', { learned: { 'ガスト': '食費', 'ライフ': null } });
r = await call('GET', '/api/settings');
ok(r.body.learned['ガスト'] === '食費' && !('ライフ' in r.body.learned) && r.body.budgets['食費'] === 30000, 'D1: 設定が保存され、学習の取り消し(null)も効き、他の端末の追加分は合わさる');
// 取り込み(大量)
DB.resetCalls();
const big = Array.from({ length: 200 }, (_, i) => rec('big' + i, '店' + i, -100 - i));
r = await call('POST', '/api/import', big);
ok(r.body.added === 200 && DB.calls <= 5, `D1: 200件を、1回の送信で取り込める(DBの呼び出し ${DB.calls}回)`);
r = await call('POST', '/api/import', Array.from({ length: 201 }, (_, i) => rec('x' + i, 'x', -1)));
ok(r.status === 500 && /200件/.test(r.body.error), 'D1: 200件を超える送信は、断る');
// ページ(4,000件ずつ)
for (let k = 0; k < 20; k++) await call('POST', '/api/import', Array.from({ length: 200 }, (_, i) => rec('p' + k + '_' + i, 'P', -10)));
const countRes = await call('GET', '/api/info');
r = await call('GET', '/api/transactions');
ok(r.body.records.length === 4000 && !!r.body.next, 'D1: 4,000件を超えると、続きのページになる(' + r.body.records.length + '件)');
const r2 = await call('GET', '/api/transactions?cursor=' + encodeURIComponent(r.body.next));
const all = [...r.body.records, ...r2.body.records];
ok(new Set(all.map((x) => x.id)).size === all.length && all.length === countRes.body.rows - countRes.body.deleted, `D1: 続きのページで、重なりも抜けもなく全件(${all.length}件)がそろう`);
// ショートカットの読み取り結果
await new Promise((x) => setTimeout(x, 10)); const tIng = new Date().toISOString(); await new Promise((x) => setTimeout(x, 10));
const OCR1 = '0:02\n997\nCafeレストラン\nガスト\nガスト\nガスト上大岡店\n2026年10月22日00時01分\n2,413円の\n支払い完了';
r = await call('POST', '/api/ingest', { raw: OCR1, captured_at: '2026-10-22 00:02:00' });
ok(r.body.merchant === 'ガスト' && r.body.status === 'confirmed' && r.body.added === 1 && /^ocr_/.test(r.body.id), 'D1: 背面タップの読み取り結果から、店名「ガスト」・確定として1件追加できる');
r = await call('POST', '/api/ingest', { raw: OCR1, captured_at: '2026-10-22 00:02:00' });
ok(r.body.added === 0, 'D1: 同じ読み取り結果を2回送っても、二重にならない');
r = await call('GET', '/api/transactions?since=' + encodeURIComponent(tIng));
const og = r.body.records.find((x) => /^ocr_/.test(x.id));
console.log(JSON.stringify(og));
ok(og && og.amount_value === -2413 && og.date === '2026年10月22日00時01分' && og.source === 'paypay_ocr' && og.raw.includes(' / '), 'D1: 金額(-2,413円)・日時・取り込み元・読み取り全文が、アプリが読める形で入る');
r = await call('POST', '/api/ingest', { raw: '0:04\n•ll 5G\n背面タップ\nたにぐちゆいさんから受け取る\n2026年10月22日00時04分\n+1,000円\n受け取り完了' });
ok(r.body.merchant === 'たにぐちゆいさんから受け取る' && r.body.status === 'confirmed', 'D1: 「受け取り完了」の画面は、「〇〇さんから受け取る」・確定になる');
r = await call('POST', '/api/ingest', { raw: '' });
ok(r.status === 500, 'D1: 空の読み取り結果は、断る');
// Notionから引っ越し(Notionのふり)
const origFetch = globalThis.fetch;
const props = (m, v, id, extra = {}) => ({ merchant: { title: [{ plain_text: m }] }, amount: { rich_text: [{ plain_text: String(Math.abs(v)) }] }, amount_value: { number: v }, date: { rich_text: [{ plain_text: '2026/09/01 10:00:00' }] }, captured_at: { rich_text: [] }, raw: { rich_text: [] }, tx_id: { rich_text: [{ plain_text: id }] }, source: { select: { name: 'paypay_csv' } }, status: { select: { name: 'confirmed' } }, transaction_type: { rich_text: [{ plain_text: '支払い' }] }, deleted: { checkbox: !!extra.deleted } });
const pagesN = [
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', last_edited_time: '2026-09-02T00:00:00.000Z', properties: props('Notionの店', -777, 'n1') },
  { id: 'aaaaaaaa-0000-0000-0000-000000000002', last_edited_time: '2026-09-03T00:00:00.000Z', properties: props('消した店', -888, 'n2', { deleted: true }) },
  { id: 'aaaaaaaa-0000-0000-0000-000000000003', last_edited_time: '2026-09-03T00:00:00.000Z', properties: { tx_id: { rich_text: [{ plain_text: '__settings__' }] }, raw: { rich_text: [{ plain_text: JSON.stringify({ budgets: { 交通: 5000 }, learned: { 'ノーション': '日用品' } }) }] }, merchant: { title: [] } } },
];
globalThis.fetch = async (url, opt) => { const body = JSON.parse(opt.body); const start = body.start_cursor ? +body.start_cursor : 0; const part = pagesN.slice(start, start + 2); return new Response(JSON.stringify({ results: part, has_more: start + 2 < pagesN.length, next_cursor: String(start + 2) }), { status: 200 }); };
const envM = { ...env, NOTION_TOKEN: 't', DATABASE_ID: 'db' };
r = await call('POST', '/api/migrate', null, envM);
ok(r.body.copied === 2 && r.body.done === true && r.body.settings === true, 'D1引っ越し: Notionを2ページに分けて読んでも、1回で全部コピーし、設定もコピーする');
r = await call('GET', '/api/info'); const afterRows = r.body.rows;
r = await call('POST', '/api/migrate', null, envM); r = await call('POST', '/api/migrate?cursor=2', null, envM);
r = await call('GET', '/api/info');
ok(r.body.rows === afterRows, 'D1引っ越し: 何度コピーしても、件数が増えない(同じIDは上書き)');
r = await call('GET', '/api/transactions?since=' + encodeURIComponent('2026-09-01T00:00:00.000Z'));
const mg = r.body.records.find((x) => x.id === 'n1'), mgd = r.body.records.find((x) => x.id === 'n2');
ok(mg && mg.merchant === 'Notionの店' && mg.amount_value === -777 && mgd && mgd.deleted === true, 'D1引っ越し: Notionの取引がコピーされ、Notionで削除済みのものは、削除済みとして記録される');
r = await call('GET', '/api/settings');
ok(r.body.budgets['食費'] === 30000 && r.body.learned['ノーション'] === '日用品', 'D1引っ越し: Notionの設定が、D1の設定と合わさる');
globalThis.fetch = origFetch;
// 切り替え
r = await call('GET', '/api/info', null, { APP_KEY: env.APP_KEY, DB });
ok(r.body.backend === 'd1', '切り替え: D1だけがつながっていて、Notionの設定がなければ、BACKENDなしで自動でD1を使う(新しく使う人)');
r = await call('GET', '/api/info', null, { APP_KEY: env.APP_KEY, DB, NOTION_TOKEN: 't', DATABASE_ID: 'd' });
ok(r.body.backend === 'notion', '切り替え: Notionの設定が残っているうちは、BACKEND=d1 にするまで、Notionのまま');
r = await call('GET', '/api/info', null, { APP_KEY: env.APP_KEY });
ok(r.status === 500 && /不足/.test(r.body.error), '切り替え: D1もNotionもつながっていないときは、設定の不足として断る');
r = await call('POST', '/api/ingest', { raw: 'x' }, { APP_KEY: env.APP_KEY, NOTION_TOKEN: 't', DATABASE_ID: 'd' });
ok(r.status === 400, '切り替え: Notionのままのときは、/api/ingest は使えない');

// ===== メールの取り込み(/api/mail) と 版 =====
r = await call('GET', '/api/info');
ok(typeof r.body.version === 'number' && r.body.version >= 2, '版: /api/info が、Workerの版(数字)を返す');
const UFJ = '【ご利用日時(日本時間)】2026年10月24日 12:34\n【ご利用金額】1,234 円\n【ご利用先】フイツトプレイス\nご利用先名等 ○○';
r = await call('POST', '/api/mail', { id: 'm1', from: 'mail@jcbdebit.bk.mufg.jp', subject: 'ご利用のお知らせ', body: UFJ });
ok(r.body.status === 'added' && r.body.source === 'ufj_mail' && r.body.merchant === 'フイツトプレイス', 'メール(UFJデビット): 日時・金額・利用先を読んで、取引として追加する');
r = await call('POST', '/api/mail', { id: 'm1', from: 'mail@jcbdebit.bk.mufg.jp', subject: 'ご利用のお知らせ', body: UFJ });
ok(r.body.status === 'duplicate', 'メール: 同じメールを2回送っても、二重にならない');
const CARD = 'いつもご利用ありがとうございます。\nご利用日時：2026/10/24 12:34\nご利用先：セブン－イレブン 横浜店\nご利用金額：1,234円';
r = await call('POST', '/api/mail', { id: 'm2', from: '三井住友カード <statement@vpass.ne.jp>', subject: 'ご利用のお知らせ', body: CARD });
ok(r.body.status === 'added' && r.body.source === 'card_mail:三井住友カード' && r.body.amount === '1,234', 'メール(三井住友カード): 差出人からカード名がつき、取引として追加される');
r = await call('POST', '/api/mail', { id: 'm3', from: 'info@mail.rakuten-card.co.jp', subject: 'カード利用のお知らせ', body: '■利用日: 2026/10/24\n■利用先: アマゾン\n■利用金額: 3,980 円', dry: true });
ok(r.body.status === 'dry' && r.body.record.source === 'card_mail:楽天カード' && r.body.record.amount_value === -3980, 'メール(動作確認 dry): 読み取り結果だけ返して、保存しない');
r = await call('POST', '/api/mail', { id: 'm4', from: 'news@vpass.ne.jp', subject: 'キャンペーンのお知らせ', body: 'お得な情報です。' });
ok(r.body.status === 'ignored', 'メール(関係ない内容): 取り込まない(エラーにはしない)');
r = await call('POST', '/api/mail', { id: 'm5', from: 'x@example.com', subject: 'ご利用のお知らせ', body: '' });
ok(r.body.status === 'ignored', 'メール(本文が空): 取り込まない');
r = await call('POST', '/api/mail', { id: 'm6', from: 'a@vpass.ne.jp', subject: 'ご利用のお知らせ', body: 'ご利用日時：2026/10/25 09:00\nご利用金額：500円\nご利用の取消のお知らせ' });
ok(r.body.status === 'added', 'メール(取消): 取り込める');

// ===== Visaデビット(銀行のデビットカードの利用通知。実際の文面は銀行ごとに違うため、よくある見出しで読めるかの確認) =====
r = await call('POST', '/api/mail', { dry: true, id: 'v1', from: '楽天銀行 <info@mail.rakuten-bank.co.jp>', subject: '【楽天銀行】デビットカードご利用のお知らせ', body: 'ご利用日時：2026/10/24 12:34:56\nご利用加盟店：AMAZON.CO.JP\nご利用金額：1,234 円\nお支払い方法：Visaデビット' });
ok(r.body.status === 'dry' && r.body.record.source === 'card_mail:楽天銀行' && r.body.record.amount_value === -1234 && r.body.record.merchant === 'AMAZON.CO.JP', 'Visaデビット(楽天銀行風): 加盟店・金額・日時を読める');
r = await call('POST', '/api/mail', { dry: true, id: 'v2', from: 'PayPay銀行 <noreply@paypay-bank.co.jp>', subject: 'Visaデビットご利用のお知らせ', body: '取引日時 2026年10月24日 18:05\n加盟店 スターバックス 横浜店\n決済金額 JPY 580' });
ok(r.body.status === 'dry' && r.body.record.source === 'card_mail:PayPay銀行' && r.body.record.amount_value === -580, 'Visaデビット(PayPay銀行風): 「JPY 580」の金額も読める');
r = await call('POST', '/api/mail', { dry: true, id: 'v3', from: 'info@smbc.co.jp', subject: 'お取引のお知らせ', body: 'お取引日時 2026/10/24 09:00\nご利用先 セブン-イレブン\nご利用金額 330円\nVisaデビット' });
ok(r.body.status === 'dry' && r.body.record.source === 'card_mail:三井住友銀行' && r.body.record.amount_value === -330, 'Visaデビット(三井住友銀行風): 読める');

// ===== 安全 =====
const rawCall = async (method, path, headers, body, e = env) => {
  const res = await worker.fetch(new Request('https://w.example' + path, { method, headers, body }), e);
  let b = null; try { b = await res.json(); } catch (_) {}
  return { status: res.status, body: b };
};
const enc = new TextEncoder();
const hk = await crypto.subtle.importKey('raw', enc.encode(env.APP_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const IK = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', hk, enc.encode('kakeibo-ingest-v1')))).map((b) => b.toString(16).padStart(2, '0')).join('');
const J = 'application/json';
r = await rawCall('POST', '/api/ingest', { 'X-App-Key': IK, 'Content-Type': J, 'CF-Connecting-IP': '1.1.1.1' }, JSON.stringify({ raw: 'セキュリティ確認\n2026年10月24日10時00分\n10円の\n支払い完了', captured_at: '2026-10-24 10:00:00' }));
ok(r.status === 200 && r.body.added === 1, '安全: 書き込み専用の鍵で、背面タップの取り込み(/api/ingest)はできる');
r = await rawCall('POST', '/api/mail', { 'X-App-Key': IK, 'Content-Type': J, 'CF-Connecting-IP': '1.1.1.1' }, JSON.stringify({ id: 'sec1', from: 'a@vpass.ne.jp', subject: 'ご利用のお知らせ', body: 'ご利用日時：2026/10/24 10:00\nご利用金額：10円\nご利用先：テスト' }));
ok(r.status === 200 && r.body.status === 'added', '安全: 書き込み専用の鍵で、メールの取り込み(/api/mail)もできる');
for (const [m, p] of [['GET', '/api/transactions'], ['GET', '/api/settings'], ['GET', '/api/info'], ['POST', '/api/apply'], ['POST', '/api/import']]) {
  r = await rawCall(m, p, { 'X-App-Key': IK, 'Content-Type': J, 'CF-Connecting-IP': '1.1.1.2' }, m === 'POST' ? '{}' : undefined);
  ok(r.status === 401, `安全: 書き込み専用の鍵では、${m} ${p} は使えない(読み出し・編集・削除ができない)`);
}
r = await rawCall('GET', '/api/info', { 'X-App-Key': IK, 'CF-Connecting-IP': '1.1.1.3' });
ok(r.status === 401, '安全: 書き込み専用の鍵でも、GETでの取り込みの入口は使えない');
// 総当たり
let last;
for (let i = 0; i < 22; i++) last = await rawCall('GET', '/api/info', { 'X-App-Key': 'wrong' + i, 'CF-Connecting-IP': '9.9.9.9' });
ok(last.status === 429, '安全: 合言葉の間違いが続くと、一時的に受け付けない(429)');
r = await rawCall('GET', '/api/info', { 'X-App-Key': env.APP_KEY, 'CF-Connecting-IP': '9.9.9.9' });
ok(r.status === 429, '安全: 断っている間は、正しい合言葉でも、その接続元からは受け付けない(当てずっぽうを試せない)');
r = await rawCall('GET', '/api/info', { 'X-App-Key': env.APP_KEY, 'CF-Connecting-IP': '8.8.8.8' });
ok(r.status === 200, '安全: ほかの接続元は、影響を受けない');
// 大きさ
r = await rawCall('POST', '/api/import', { 'X-App-Key': env.APP_KEY, 'Content-Type': J, 'CF-Connecting-IP': '7.7.7.7' }, JSON.stringify([{ id: 'big', merchant: 'x'.repeat(2000000) }]));
ok(r.status === 500 && /大きすぎ/.test(r.body.error), '安全: 大きすぎるデータ(約1MB超)は、断る');
await new Promise((x) => setTimeout(x, 10)); const tLong = new Date().toISOString(); await new Promise((x) => setTimeout(x, 10));
r = await rawCall('POST', '/api/import', { 'X-App-Key': env.APP_KEY, 'Content-Type': J, 'CF-Connecting-IP': '7.7.7.7' }, JSON.stringify([{ id: 'long1', merchant: 'あ'.repeat(5000), raw: 'r'.repeat(20000) }]));
const got = (await rawCall('GET', '/api/transactions?since=' + encodeURIComponent(tLong), { 'X-App-Key': env.APP_KEY, 'CF-Connecting-IP': '7.7.7.7' })).body.records.find((x) => x.id === 'long1');
ok(got && got.merchant.length === 300 && got.raw.length === 6000, '安全: 極端に長い文字は、切り詰めて保存される(店名300文字・全文6,000文字まで)');
r = await rawCall('GET', '/api/info', { 'X-App-Key': env.APP_KEY, 'CF-Connecting-IP': '6.6.6.6' });
ok(r.body.weakKey === false, '安全: 長い合言葉なら、弱い合言葉の警告は出ない');
r = await rawCall('GET', '/api/info', { 'X-App-Key': '111111', 'CF-Connecting-IP': '6.6.6.7' }, undefined, { ...env, APP_KEY: '111111' });
ok(r.body.weakKey === true, '安全: 短い合言葉(16文字未満)は、警告の印(weakKey)が付く');
r = await call('POST', '/api/mail', { dry: true, id: 'xss1', from: '"<img src=x onerror=alert(1)>" <a@evil.example>', subject: 'ご利用のお知らせ', body: 'ご利用日時：2026/10/24 10:00\nご利用金額：10円\nご利用先：テスト' });
ok(r.body.status === 'dry' && !/[<>"']/.test(r.body.record.source), '安全: 差出人の表示名に、危険な記号が入っていても、取り込み元の名前からは除かれる');

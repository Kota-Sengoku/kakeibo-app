import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
const src = new URL('../src/worker.js', import.meta.url);
const tmp = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), 'worker_under_test.mjs');
fs.copyFileSync(src, tmp);
const w = (await import(pathToFileURL(tmp).href)).default;

const calls = []; let settingsPage = null;
const RT = s => ({ rich_text: s ? [{ plain_text: s }] : [] });
const rec = (id, m, extra = {}) => ({ id, properties: { merchant: { title: [{ plain_text: m }] }, amount: RT('100'), amount_value: { number: -100 }, date: RT('2026/10/01'), captured_at: RT(''), raw: RT(''), status: { select: { name: 'confirmed' } }, source: { select: { name: 'paypay_ocr' } }, tx_id: RT(extra.tx || ''), transaction_type: RT(''), category: RT(''), deleted: { checkbox: !!extra.del } } });
globalThis.fetch = async (url, opt) => {
  const body = opt.body ? JSON.parse(opt.body) : null; calls.push([opt.method, url.replace('https://api.notion.com/v1', ''), body]);
  let data = {};
  if (url.endsWith('/query')) {
    const f = body.filter;
    if (f.property === 'tx_id') data = { results: settingsPage ? [settingsPage] : [] };
    else if (f.timestamp === 'last_edited_time') data = { results: [rec('aaaaaaaa-0000-0000-0000-000000000001', '変更あり'), rec('aaaaaaaa-0000-0000-0000-000000000002', '削除された', { del: true }), rec('aaaaaaaa-0000-0000-0000-000000000003', '設定', { tx: '__settings__', del: true })], has_more: false };
    else data = { results: [rec('aaaaaaaa-0000-0000-0000-000000000001', '店A')], has_more: true, next_cursor: 'c' + calls.length };
  } else if (url.endsWith('/pages') && opt.method === 'POST') {
    settingsPage = { id: 'sp', properties: { raw: { rich_text: body.properties.raw.rich_text.map(t => ({ plain_text: t.text.content })) } } }; data = { id: 'sp' };
  } else if (url.includes('/pages/sp')) { settingsPage.properties.raw = { rich_text: body.properties.raw.rich_text.map(t => ({ plain_text: t.text.content })) }; data = {}; }
  return new Response(JSON.stringify(data), { status: 200 });
};
const env = { APP_KEY: 'k'.repeat(20), NOTION_TOKEN: 't', DATABASE_ID: 'db' };
const req = (m, p, b) => new Request('https://x' + p, { method: m, headers: { 'X-App-Key': env.APP_KEY }, body: b ? JSON.stringify(b) : undefined });
let r = await w.fetch(req('GET', '/api/transactions'), env); let j = await r.json();
console.log('full: query calls', calls.filter(c => c[1].endsWith('/query')).length, '(上限40) next?', !!j.next, 'X-Server-Time header', !!r.headers.get('X-Server-Time'));
calls.length = 0;
r = await w.fetch(req('GET', '/api/transactions?since=2026-10-18T00:00:00Z'), env); j = await r.json();
console.log('incremental:', j.records.map(x => x.merchant + (x.deleted ? '(deleted)' : '')).join(' | '));
console.log('settings (empty):', JSON.stringify(await (await w.fetch(req('GET', '/api/settings'), env)).json()));
await w.fetch(req('POST', '/api/settings', { learned: { a: '食費' }, subIgnore: ['x'], budgets: { 食費: 30000 } }), env);
const m = await (await w.fetch(req('POST', '/api/settings', { learned: { b: '交通' }, subIgnore: [] }), env)).json();
console.log('merged:', JSON.stringify(m));
const stored = await (await w.fetch(req('GET', '/api/settings'), env)).json();
console.log('stored == merged:', JSON.stringify(stored) === JSON.stringify(m));
const big = { learned: Object.fromEntries(Array.from({ length: 400 }, (_, i) => ['店' + i + 'あ'.repeat(20), '食費'])) };
const bm = await (await w.fetch(req('POST', '/api/settings', big), env)).json();
console.log('large settings keys:', Object.keys(bm.learned).length, 'chunks', settingsPage.properties.raw.rich_text.length);
fs.unlinkSync(tmp);

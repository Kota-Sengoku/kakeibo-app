import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) process.exitCode = 1; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const made = [], docH = {};
let pointAt = () => null;       // 画面の座標 → 行のID(テスト用)
const el = () => {
  const handlers = {};
  const e = { className: '', innerHTML: '', textContent: '', style: {}, dataset: {}, classList: { toggle() {}, remove() {} }, handlers,
    addEventListener(t, f) { handlers[t] = f; }, remove() { this.removed = true; }, appendChild() {}, querySelectorAll() { return []; },
    querySelector() { return { value: '', style: {}, innerHTML: '' }; } };
  made.push(e); return e;
};
const store = new Map();
const ctx = vm.createContext({ console, TextDecoder, TextEncoder, DataView, Uint8Array, Int32Array, Date, JSON, Math, Promise, Set, Map, URL, encodeURIComponent, decodeURIComponent, parseInt, setTimeout, clearTimeout, clearInterval() {}, Intl, Object, Array, String, Number, Error, RegExp, isNaN, escape, atob,
  setInterval() { return 1; }, fetch: async () => { throw new Error('no net'); }, confirm: () => true,
  document: { documentElement: { style: { setProperty() {} }, setPointerCapture() {} }, getElementById: () => el(), addEventListener(t, f) { docH[t] = f; }, createElement: el, body: { appendChild() {} }, querySelector: () => null, hidden: false,
    elementFromPoint: (x, y) => { const id = pointAt(x, y); return id ? { closest: s => s === '[data-hs]' ? { dataset: { id } } : null } : null; } },
  window: { scrollTo() {}, addEventListener() {}, innerHeight: 800 }, location: { hostname: 'x.github.io', hash: '#/history', pathname: '/', protocol: 'https:' }, history: { replaceState() {} }, navigator: {},
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }, indexedDB: undefined });
vm.runInContext(script, ctx);
vm.runInContext('S.settings.ufjIncomeKw=["給料","プレモ","サンプル商事"]; S.settings.ufjP2pKw=["ヤマダ"]; S.settings.allowKw=["ヤマダ","山田花子","山田太郎","090******00"];', ctx);
const get = c => vm.runInContext(c, ctx);
const run = c => vm.runInContext(c, ctx);
const T = (m, v, extra = {}) => ({ id: extra.id || 'id_' + m, date: '2026/10/10 12:00:00', amount: String(Math.abs(v)), amount_value: v, merchant: m, transaction_type: extra.type || (v > 0 ? '振替入金' : '支払い'), status: 'confirmed', source: extra.source || 'ufj_csv', raw: extra.raw || '' });
const cl = (act, data = {}) => docH.click({ target: { closest: s => s === '[data-act]' ? { dataset: { act, ...data } } : null } });
// ============ 攻撃テスト(アプリ側): 悪意のあるデータが入っても、壊れない・乗っ取られない ============
const EVILS = ['<img src=x onerror=alert(1)>', '"><script>alert(2)</script>', "'><svg onload=alert(3)>", '" onmouseover="alert(4)" x="', 'javascript:alert(5)', '</div><iframe src=//evil></iframe>', '&lt;b&gt;', '${alert(6)}', '`${1+1}`'];
const BAD = /<img\b|<script\b|<svg\s+onload|<iframe\b|"\s+on[a-z]+\s*=(?!"history\.back\(\)")|'\s+on[a-z]+\s*=/;      // エスケープされていない、危険な形(「&lt;img」のような、無害にした文字は、含めない)
const FIELDS = ['merchant', 'category', 'transaction_type', 'status', 'source', 'raw', 'date', 'amount', 'captured_at', 'id', 'offsetOf'];
const base = (i, f, v) => ({ id: 'a' + i, date: '2026/10/24 10:00:00', amount: '100', amount_value: -100, merchant: 'ok', transaction_type: '支払い', status: 'confirmed', source: 'paypay_csv', raw: '', category: '食費', ...{ [f]: v } });

// 1) 取り込まれたデータの、どの項目に悪意のある文字が入っても、画面に、そのままのタグが出ない
let leaks = [], n = 0;
for (const f of FIELDS) for (const v of EVILS) {
  const rec = base(n++, f, v);
  run('S.learned={}; S.overlay={edits:{},added:[],deleted:[]}; S.cloud={url:"https://w.example",key:"k"}; S.cur={y:2026,m:10}; S.base=' + JSON.stringify([rec, { ...rec, id: 'b' + n, merchant: 'ok2', amount_value: 500, transaction_type: '受け取った金額', category: '収入' }]));
  try {
    const views = [get('viewHistory(all())'), get('viewCal(all())'), get("viewDay(all(),'2026-10-24')"), get("viewStats(all(),'month')"), get("viewStats(all(),'year')"), get("viewStats(all(),'all')"), get('viewSync(all())')];
    views.forEach((h, i) => { if (BAD.test(h)) leaks.push(`${f}=${v.slice(0, 20)} (view ${i})`); });
  } catch (e) { leaks.push(`${f}=${v.slice(0, 20)} が例外: ${e.message}`); }
}
ok(leaks.length === 0, '攻撃(XSS): 取引のどの項目に悪意のある文字が入っても、画面にはそのまま出ない・壊れない ' + (leaks.length ? JSON.stringify(leaks.slice(0, 6)) : ''));

// 2) 設定(サーバーから届く)に悪意のあるものが入っていても、画面に出ない
run('S.base=[]; S.cloud={url:"https://w.example",key:"k"}');
get('applyServerSettings(' + JSON.stringify({ cats: [{ name: '<img src=x onerror=alert(1)>', color: 'red;background:url(//evil)' }, { name: 'ok', color: '"><script>alert(2)</script>' }], rules: [{ kw: '<svg onload=alert(3)>', cat: 'ok' }], subDefs: [{ name: '<img src=x onerror=alert(4)>', day: 1, amount: 100 }], ufjIncomeKw: ['<script>alert(5)</script>'], allowKw: ['" onmouseover="alert(4)" x="'] }) + ')');
const sv = [get('viewSync([])'), get('viewHistory([])')].join('');
ok(!BAD.test(sv), '攻撃(XSS): サーバーから届いた設定(カテゴリー名・ルール・サブスク・言葉)に、悪意のある文字があっても、そのままは出ない');
ok(!/style="[^"]*background:\s*red;background:url/.test(get('JSON.stringify(CATS)') + sv) && get('Object.values(CATS).every(c=>/^#[0-9a-fA-F]{3,8}$/.test(c))'), '攻撃(CSS): カテゴリーの色に、色以外(;で別の指定を足すもの)があっても、使われない');

// 3) 特別な名前(constructor / __proto__ など)で、計算が壊れない
const PROTO = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'prototype'];
let bad2 = [];
for (const k of PROTO) {
  for (const f of ['merchant', 'category', 'id']) {
    run('S.learned={}; S.cloud=null; S.cur={y:2026,m:10}; S.base=' + JSON.stringify([base(1, f, k), { ...base(2, 'merchant', 'ふつうの店'), amount_value: -300 }]));
    try {
      const all = get('all()'); const tot = get('exp(all())');
      const st = get("viewStats(all(),'month')") + get("viewStats(all(),'all')");
      if (!Number.isFinite(tot) || /NaN|undefined|function/.test(st)) bad2.push(`${f}=${k}: 合計=${tot}`);
      if (get('Object.keys(CATS).includes("' + k + '")')) bad2.push(`${f}=${k}: カテゴリーに混ざった`);
    } catch (e) { bad2.push(`${f}=${k}: 例外 ${e.message}`); }
  }
}
ok(bad2.length === 0, '攻撃(特別な名前): 店名・カテゴリーが constructor / __proto__ などでも、合計が壊れない(NaNにならない) ' + (bad2.length ? JSON.stringify(bad2.slice(0, 5)) : ''));

// 4) 設定の取り込みで、全体の動作が書き換えられない(プロトタイプ汚染)
get('applyServerSettings(JSON.parse(\'{"__proto__":{"polluted":"yes"},"learned":{"__proto__":{"x":"y"}},"budgets":{"__proto__":{"z":1}},"offsets":{"__proto__":{"q":1}},"constructor":{"prototype":{"polluted2":"yes"}}}\'))');
ok(get('({}).polluted') === undefined && get('({}).polluted2') === undefined && get('({}).x') === undefined && get('({}).z') === undefined && get('({}).q') === undefined, '攻撃(汚染): 設定に __proto__ / constructor を入れても、すべてのオブジェクトに、影響しない');

// 5) 接続リンクは、確認なしに、接続先を書き換えない(悪意のあるリンクを開かされても)
const link = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
run('S.cloud={url:"https://mine.example",key:"mykey"}; S.base=[{id:"keep"}]');
ctx.location.hash = '#/connect/' + link({ url: 'https://evil.example', key: 'k' });
let asked = null; ctx.confirm = (m) => { asked = m; return false; };
get('handleConnectLink()');
ok(get('S.cloud.url') === 'https://mine.example' && asked && asked.includes('evil.example'), '攻撃(偽のリンク): 接続リンクを開いても、確認で断れば、接続先は変わらない(確認には、接続先の名前が出る)');
ctx.location.hash = '#/connect/' + link({ url: 'http://insecure.example', key: 'k' });
ctx.confirm = () => true;
get('handleConnectLink()');
ok(get('S.cloud.url') === 'https://mine.example', '攻撃(偽のリンク): https:// ではない接続先は、確認に進まず、断る');
ctx.location.hash = '#/connect/' + link({ url: 'https://good.example', key: 'k2' });
get('handleConnectLink()');
ok(get('S.cloud.url') === 'https://good.example', '接続リンク: 確認でOKしたときは、接続される');
ctx.location.hash = '#/history';

// 6) 大きなデータ・長い文字で、固まらない
run('S.cloud=null; S.learned={}; S.base=' + JSON.stringify(Array.from({ length: 3000 }, (_, i) => ({ ...base(i, 'merchant', ('あ'.repeat(200) + ' ' + 'ガスト'.repeat(50) + i)), raw: ('0:01 ' + 'ライフ '.repeat(500)).slice(0, 4000) })) ));
const t0 = Date.now(); get('all()'); get("viewStats(all(),'all')"); const dt = Date.now() - t0;
ok(dt < 8000, `攻撃(重いデータ): 3,000件の長い店名・長い本文でも、固まらない(${dt}ms)`);
const rx = 'a'.repeat(100000) + '!';
const t1 = Date.now(); get('autoCat(' + JSON.stringify({ merchant: rx, raw: rx }) + ')'); const dt1 = Date.now() - t1;
ok(dt1 < 3000, `攻撃(正規表現の暴走): 長い文字を、自動分類に渡しても、固まらない(${dt1}ms)`);

// 7) 重大な更新(workerBlock): 古いWorkerのときは、送受信を止めて、更新の画面だけを出す
run("S.cloud={url:'https://w.example',key:'k'}; RELEASE={worker:6,workerMin:2,workerBlock:6}; cloudInfo={version:5,backend:'d1',d1:true,rows:3};");
ok(get('blocked()') === true && /更新が必要/.test(get('viewBlocked()')) && /Edit code/.test(get('viewBlocked()')), '更新ブロック: 必須の版より古いWorkerのときは、「更新が必要」の画面になる');
let calls = [];
ctx.fetch = async (u) => { calls.push(String(u)); return { ok: true, json: async () => ({}), text: async () => '' }; };
let rejected = false; try { await get("cloudFetch('/api/transactions')"); } catch (e) { rejected = e.message === 'blocked'; }
const infoOk = await get("cloudFetch('/api/info')").then(() => true, () => false);
ok(rejected && infoOk && !calls.some(u => u.includes('/api/transactions')), '更新ブロック: 止めているあいだは、データの送受信をしない(状態の確認だけは、通す)');
run("cloudInfo={version:6,backend:'d1',d1:true,rows:3};");
ok(get('blocked()') === false, '更新ブロック: 更新して版が足りたら、ブロックは外れる');
run("cloudInfo={error:'通信できません'};");
ok(get('blocked()') === false, '更新ブロック: 確認できないとき(電波がない等)は、止めない');
run("RELEASE={worker:6,workerMin:2,workerBlock:0}; cloudInfo={version:1};");
ok(get('blocked()') === false, '更新ブロック: workerBlock が 0 なら、古くても止めない(ふだんの状態)');
run("S.cloud=null; RELEASE=null; cloudInfo=null;");

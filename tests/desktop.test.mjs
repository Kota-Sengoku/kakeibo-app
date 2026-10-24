import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) process.exitCode = 1; };

const make = (desktop) => {
  const made = [], docH = {};
  const el = () => { const e = { className: '', innerHTML: '', textContent: '', style: {}, dataset: {}, classList: { toggle() {}, remove() {} }, addEventListener() {}, remove() {}, appendChild() {}, querySelectorAll() { return []; }, querySelector() { return { value: '', style: {} }; } }; made.push(e); return e; };
  const store = new Map();
  const loc = { hostname: 'x.github.io', hash: '#/', pathname: '/', protocol: 'https:' };
  const ctx = vm.createContext({ console, TextDecoder, TextEncoder, DataView, Uint8Array, Int32Array, Date, JSON, Math, Promise, Set, Map, URL, encodeURIComponent, decodeURIComponent, parseInt, setTimeout, clearTimeout, Intl, Object, Array, String, Number, Error, RegExp, isNaN, escape, atob,
    setInterval() {}, fetch: async () => { throw new Error('no net'); }, confirm: () => true,
    document: { documentElement: { style: { setProperty() {} } }, getElementById: () => el(), addEventListener(t, f) { docH[t] = f; }, createElement: el, body: { appendChild() {} }, querySelector: () => null, hidden: false },
    window: { scrollTo() {}, addEventListener() {}, matchMedia: q => ({ matches: desktop && q.includes('960'), addEventListener() {} }) },
    location: loc, history: { replaceState() {} }, navigator: {},
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }, indexedDB: undefined });
  vm.runInContext(script, ctx);
  return { ctx, docH, made, loc, get: c => vm.runInContext(c, ctx), run: c => vm.runInContext(c, ctx) };
};
const T = (m, v, day) => ({ id: 'id_' + m + day, date: day.replace(/-/g, '/') + ' 12:00:00', amount: String(Math.abs(v)), amount_value: v, merchant: m, transaction_type: v > 0 ? '振替入金' : '支払い', status: 'confirmed', source: 'paypay_csv', raw: '' });
const seed = a => a.run(`S.cur={y:2026,m:10}; S.selDay=null; S.base=${JSON.stringify([T('ライフ', -1940, '2026-10-09'), T('Netflix', -1490, '2026-10-09'), T('給料', 182000, '2026-10-25'), T('スタバ', -600, '2026-10-12')])}`);
const keydown = (a, key, tag = 'BODY') => a.docH.keydown({ key, target: { tagName: tag }, preventDefault() {} });

// ---------- パソコン(幅960px以上) ----------
const D = make(true);
seed(D);
D.run('render()');
const page = D.get('app.innerHTML');
ok(page.includes('class="shell"') && page.includes('<aside class="side">') && page.includes('class="addbtn"') && page.includes('class="sidenav"'), 'PC: 左にサイドメニュー(取引を追加・各画面)が出る');
ok(page.includes('class="side-status"') && page.includes('端末内のデータ'), 'PC: サイドメニューの下に、データの接続状況が出る');
ok(D.get("viewCal(all())").includes('class="daypanel"') && D.get("viewCal(all())").includes('class="statrow"'), 'PC: カレンダーの画面に、収支のカードと、選んだ日の詳細パネルがある');
ok(D.get("viewCal(all())").includes('data-act="today"'), 'PC: 「今日に移動」ボタンがある');
// 日付を選ぶと、右のパネルが切り替わる(画面は移動しない)
D.docH.click({ target: { closest: s => s === '[data-act]' ? { dataset: { act: 'pick-day', d: '2026-10-09' } } : null } });
ok(D.get('S.selDay') === '2026-10-09' && D.loc.hash === '#/', 'PC: 日付をクリックすると、画面は移動せず、右のパネルが切り替わる');
const panel = D.get("viewCal(all())");
ok(panel.includes('10月9日(金)') && panel.includes('ライフ') && panel.includes('Netflix') && panel.includes('¥3,430'), 'PC: パネルに、その日の取引と、支出の合計(¥3,430)が出る');
ok(/class="cell [^"]*sel[^"]*" data-act="pick-day" data-d="2026-10-09"/.test(panel), 'PC: 選んだ日が、カレンダーで目立つ');
// レポートは3列
const stats = D.get("viewStats(all(),'month')");
ok(stats.includes('class="rep3"') && stats.includes('class="sumrow"') && stats.includes('月間') && stats.includes('年間') && stats.includes('全期間'), 'PC: レポートは、月間・年間・全期間が3列で同時に出る');
ok(!stats.includes('class="tabs"'), 'PC: レポートに、タブは出ない(同時に見えるため)');
// 今日に移動・キー操作
D.run('S.cur={y:2026,m:7}'); D.docH.click({ target: { closest: s => s === '[data-act]' ? { dataset: { act: 'today' } } : null } });
const nowY = D.get('new Date().getFullYear()'), nowM = D.get('new Date().getMonth()+1');
ok(D.get('S.cur.y') === nowY && D.get('S.cur.m') === nowM, 'PC: 「今日に移動」で、今月に戻る');
D.run('S.cur={y:2026,m:10}');
keydown(D, 'ArrowRight'); ok(D.get('S.cur.m') === 11, 'PC: →キーで、次の月へ');
keydown(D, 'ArrowLeft'); keydown(D, 'ArrowLeft'); ok(D.get('S.cur.m') === 9, 'PC: ←キーで、前の月へ');
const before = D.made.length; keydown(D, 'n'); ok(D.made.length > before, 'PC: Nキーで、取引の追加画面が開く');
const before2 = D.made.length; keydown(D, 'n', 'INPUT'); ok(D.made.length === before2, 'PC: 入力欄に文字を打っているときは、キー操作が働かない');
keydown(D, 't'); ok(D.get('S.cur.m') === nowM && D.get('S.selDay') === D.get('ymd(today)'), 'PC: Tキーで、今日に移動');
// 設定・履歴・サブスクの枠
D.loc.hash = '#/sync'; D.run('render()'); ok(D.get('app.innerHTML').includes('class="main cols"'), 'PC: 設定は2列(cols)で表示される');
D.loc.hash = '#/history'; D.run('render()'); ok(D.get('app.innerHTML').includes('class="main narrow"'), 'PC: 履歴は、読みやすい幅(narrow)で表示される');
D.loc.hash = '#/subs'; D.run('render()'); ok(D.get('app.innerHTML').includes('サブスク・定期収入') && !D.get('app.innerHTML').includes('href="#/subs"'), 'サブスクは、タブではなく設定の中にある(古いURLでも設定が開く)');

// ---------- スマホ(幅960px未満) ----------
const M = make(false);
seed(M);
M.docH.click({ target: { closest: s => s === '[data-act]' ? { dataset: { act: 'pick-day', d: '2026-10-09' } } : null } });
ok(M.get('S.selDay') === '2026-10-09' && !M.loc.hash.includes('#/day/'), 'スマホ: 日付をタップしても画面は移動せず、その日が選ばれる');
const mc = M.get('viewCal(all())');
ok(mc.includes('class="daypanel"') && mc.includes('10月9日'), 'スマホ: カレンダーの下に、選んだ日の取引が出る');
ok(M.get("viewStats(all(),'month')").includes('class="tabs"') && !M.get("viewStats(all(),'month')").includes('class="rep3"'), 'スマホ: レポートは、今までどおりタブで切り替える');
ok(/class="cell [^"]*\bsel\b/.test(M.get("viewCal(all())")), 'スマホ: 選んだ日が、カレンダー上で強調される');
ok(/<span class="e">-[0-9,.万]+<\/span>/.test(M.get("viewCal(all())")), 'カレンダーのマスには、その日の「-支出」が出る');
ok(!M.get('app.innerHTML').includes('href="#/subs"'), 'サブスクのタブはない');
M.run("S.hist={filter:'all',q:'',upto:null}");
const allN = M.get('histList(all()).list.length');
M.run("S.hist.q='netflix'");
ok(M.get('histList(all()).list.length') > 0 && M.get('histList(all()).list.length') < allN && M.get("histList(all()).list.every(t=>/Netflix/.test(t.merchant))"), '履歴: 店名で検索できる');
M.run("S.hist.q='1940'"); ok(M.get("histList(all()).list.some(t=>Math.abs(t.value)===1940)"), '履歴: 金額でも検索できる');
M.run("S.hist.q=''; S.hist.upto='2026-10-10'");
ok(M.get("histList(all()).list.every(t=>t.day<='2026-10-10')") && M.get('histList(all()).list.length') > 0, '履歴: 日付を指定すると、その日以前の取引から表示される');
M.run("S.hist.upto=null");
ok(M.get("app.innerHTML") !== undefined && (M.run('render()'), M.get('app.innerHTML')).includes('<nav class="nav">'), 'スマホ: 下のメニューも、今までどおり出る');

// ---------- CSS ----------
ok(html.includes('@media (min-width:960px)') && html.includes('.side,.dsk{display:none}') && html.includes('@media (min-width:960px) and (max-width:1180px)'), 'CSS: PC用(960px以上)と、少し狭い幅用の切り替えがある');
ok(html.includes('.dow,.grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}'), 'CSS: カレンダーの列が、中身に引きずられず7等分になる');
ok(html.includes('@media (hover:hover)') && html.includes('.btn:hover:not(:active)'), 'CSS: マウスを乗せたときの見た目がある');

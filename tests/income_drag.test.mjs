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

// ================= 収入の判定(銀行の入金) =================
const income = () => get('inc(all())'), by = () => Object.fromEntries(get('all()').map(t => [t.merchant, t]));
run('S.base=' + JSON.stringify([
  T('給料', 17314), T('プレモ振込', 5000), T('ＡＴＭ入金', 30000), T('ミツビシＵＦＪニコス返金', 800),
  T('さとうさんから受け取る', 3000, { source: 'paypay_csv', type: '受け取った金額' }),
  T('たなかさんから受け取る', 1000, { source: 'paypay_ocr', type: '支払い' }),
  T('ライフ', -1940, { source: 'paypay_csv' }),
]));
let m = by();
ok(m['給料'].group === 'main' && m['給料'].category === '収入', 'UFJ: 「給料」を含む入金は、収入になる');
ok(m['プレモ振込'].group === 'main' && m['プレモ振込'].category === '収入', 'UFJ: 「プレモ」を含む入金も、収入になる');
ok(m['ＡＴＭ入金'].group === 'nonincome' && m['ミツビシＵＦＪニコス返金'].group === 'nonincome', 'UFJ: それ以外の入金は、収入以外(収入に数えない)になる');
ok(income() === 17314 + 5000, '収入の合計は、給料・プレモだけ(ATM入金や、「お小遣いの人」以外から受け取った立替金は入らない)');
ok(m['さとうさんから受け取る'].category === '立替金' && m['さとうさんから受け取る'].offAmt === 1940 && m['さとうさんから受け取る'].advance === 3000, '「お小遣いの人」以外から受け取ったお金は、お小遣いにならず立替金になり、直前の食費の支払い(1,940円)まで相殺される');
ok(m['たなかさんから受け取る'].category === '立替金' && m['たなかさんから受け取る'].type === '受け取った金額', '店名が「〇〇さんから受け取る」なら、種類が違っても受け取りとして扱い、立替金になる');
ok(m['給料'].category === '収入' && m['ライフ'].value < 0, '給料は「収入」のまま、支出は支出のまま');
// 履歴の絞り込み
run('S.hist.filter="nonincome"'); const hv = get('viewHistory(all())');
ok(hv.includes('収入以外の入金') && hv.includes('ＡＴＭ入金') && !hv.includes('data-id="id_給料"'), '履歴に「収入以外の入金」の絞り込みがあり、収入は出ない');
run('S.hist.filter="all"');
// 言葉を変える
run('S.settings.ufjIncomeKw=["給料","プレモ","賞与"]; S.base[2].merchant="賞与"');
ok(by()['賞与'].group === 'main', '言葉「賞与」を足すと、その入金が収入になる(過去の分にも反映)');
run('S.settings.ufjIncomeKw=["プレモ"]');
ok(by()['給料'].group === 'nonincome' && by()['プレモ振込'].group === 'main', '言葉から「給料」を外すと、給料は収入以外になる');
run('S.settings.ufjIncomeOnly=false');
ok(by()['給料'].group === 'main' && income() >= 17314 + 5000 + 30000, '「言葉を含む入金だけを収入にする」をオフにすると、UFJの入金はすべて収入になる');
run('S.settings.ufjIncomeOnly=true; S.settings.ufjIncomeKw=["給料","プレモ"]; S.base[2].merchant="ＡＴＭ入金"');
// 設定の画面と操作
const sv = get('viewSync(all())');
ok(sv.includes('収入の判定(銀行の入金)') && sv.includes('給料') && sv.includes('プレモ') && sv.includes('data-act="kw-add"') && sv.includes('data-act="kw-del"'), '設定に「収入の判定」のカードがあり、言葉の一覧・追加・削除ができる');
cl('kw-add'); const sheet = made.at(-1);
const q = sheet.querySelector; let kwInput = { value: '賞与' }; sheet.querySelector = () => kwInput;
sheet.handlers.click({ target: { closest: s => s === '[data-save]' ? {} : null } });
ok(get('S.settings.ufjIncomeKw').includes('賞与'), '「言葉を追加」で、言葉が増える');
cl('kw-del', { i: '0' }); ok(get('S.settings.ufjIncomeKw')[0] === 'プレモ' && !get('S.settings.ufjIncomeKw').includes('給料'), '言葉の「✕」で、削除できる');
run('S.settings.ufjIncomeKw=["給料","プレモ"]');
// 定期収入に、収入以外は混ざらない
run('S.base=' + JSON.stringify(['2026-08-25', '2026-09-25', '2026-10-25'].flatMap(d => [{ ...T('給料', 180000, { id: 'k' + d }), date: d.replace(/-/g, '/') }, { ...T('ＡＴＭ入金', 30000, { id: 'a' + d }), date: d.replace(/-/g, '/') }])));
const subs = get("detectSubs(all(),'income').map(x=>x.merchant)");
ok(subs.length === 1 && subs[0] === '給料', '定期収入には、給料だけが出る(ATM入金などは出ない)');
// 編集画面: 収入のカテゴリー
run('S.base=' + JSON.stringify([T('給料', 180000, { id: 'inc1' })]));
get("openSheet('inc1')"); const es = made.at(-1);
ok(es.innerHTML.includes('data-cat="収入"') && es.innerHTML.includes('data-cat="個人間送金"') && !es.innerHTML.includes('data-cat="食費"'), '収入の編集画面では、カテゴリーに「収入」「個人間送金」が出る');
get("openSheet(null)"); const ns = made.at(-1);
ok(ns.innerHTML.includes('data-cat="食費"') && !ns.innerHTML.includes('data-cat="個人間送金"'), '支出の追加画面では、支出のカテゴリーが出る');
let boxHtml = ''; const input = { value: '', style: {} };
ns.querySelector = s => s === '#f-cats' ? { set innerHTML(v) { boxHtml = v; }, get innerHTML() { return boxHtml; } } : (s === '#f-amt' ? { value: '5000' } : s === '#f-mer' ? { value: 'ともだち' } : s === '#f-day' ? { value: '2026-10-10' } : input);
ns.querySelectorAll = () => [];
ns.handlers.click({ target: { closest: s => s === '[data-dir]' ? { dataset: { dir: '1' } } : null } });
ok(boxHtml.includes('個人間送金') && boxHtml.includes('収入') && !boxHtml.includes('食費'), '「収入」に切り替えると、カテゴリーが収入のものに入れ替わる');
ns.handlers.click({ target: { closest: s => s === '[data-cat]' ? { dataset: { cat: '個人間送金' } } : null } });
ns.handlers.click({ target: { closest: s => s === '[data-save]' ? {} : null } });
const added = get('S.overlay.added.at(-1)');
ok(added && added.amount_value === 5000 && added.category === '個人間送金', '手入力の収入に「個人間送金」を選んで保存できる');
ok(get("S.learned[nk('ともだち')]") === undefined, '収入のカテゴリーは、店名の学習には使われない');

// ================= 長押し → なぞって、まとめて選択 =================
const rows = ['r1', 'r2', 'r3', 'r4', 'r5'];
const loadRows = () => { run('S.base=' + JSON.stringify(rows.map((id, i) => T('店' + id, -(100 + i), { id, source: 'paypay_csv' }))) + '; S.overlay={edits:{},added:[],deleted:[]}; S.sel={on:false,ids:[]}; S.hist.filter="all"'); };
pointAt = (x, y) => (y >= 100 && y < 600) ? rows[Math.floor((y - 100) / 100)] : null;    // 100px ごとに1行
const ptr = (type, id, x, y, extra = {}) => docH[type]({ target: { closest: s => s === '[data-hs]' ? { dataset: { id } } : (s === '.chk' && extra.chk ? {} : (s === 'button,a' ? {} : null)) }, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', ...extra });
const view = () => get('viewHistory(all())');

loadRows();
ok(view().split('data-hs="1"').length - 1 === 5, '履歴の行は、長押しできる行(data-hs)になっている');
ptr('pointerdown', 'r2', 50, 250); await sleep(30);
ok(get('S.sel.on') === false, '押した直後は、まだ選択モードにならない(ふつうのタップのため)');
await sleep(420);
ok(get('S.sel.on') === true && JSON.stringify(get('S.sel.ids')) === '["r2"]', '長押しすると、選択モードになり、その行が選ばれる');
ptr('pointermove', 'r2', 50, 350); ptr('pointermove', 'r2', 50, 450);
ok(JSON.stringify(get('S.sel.ids')) === '["r2","r3","r4"]', '指を下になぞると、通った行(r3・r4)も、まとめて選ばれる');
ptr('pointermove', 'r2', 50, 150);
ok(get('S.sel.ids').includes('r1') && get('S.sel.ids').length === 4, '上にもなぞれる(r1も選ばれる)');
let prevented = false; docH.touchmove({ cancelable: true, preventDefault() { prevented = true; } });
ok(prevented, 'なぞっている間は、画面がスクロールしない');
docH.pointerup({}); await sleep(10);
const before = made.length; cl('edit', { id: 'r3' });
ok(made.length === before, '指を離した直後は、編集画面が開かない(誤タップ防止)');
ok(view().includes('class="selbar"') && view().includes('4件選択中'), '選択バーに、選んだ件数(4件)が出る');
let pv = false; docH.contextmenu({ target: { closest: s => s === '[data-hs]' ? {} : null }, preventDefault() { pv = true; } });
ok(pv, '長押しのとき、端末のメニュー(コピーなど)が出ない');

// 長押しの前に動かしたら、ふつうのスクロール
await sleep(400);
loadRows(); ptr('pointerdown', 'r2', 50, 250); ptr('pointermove', 'r2', 50, 290); await sleep(450);
ok(get('S.sel.on') === false, '長押しの前に指を動かしたら、選択モードにならない(スクロールの動き)');
loadRows(); ptr('pointerdown', 'r2', 50, 250); docH.pointerup({}); await sleep(450);
ok(get('S.sel.on') === false, 'すぐ離す(タップ)なら、選択モードにならない');

// 選択中: 左の丸印から、すぐなぞれる
loadRows(); run('S.sel={on:true,ids:[]}');
ptr('pointerdown', 'r1', 20, 150, { chk: true });
ok(JSON.stringify(get('S.sel.ids')) === '["r1"]', '選択中は、左の丸印を押すと、待たずに選び始められる');
ptr('pointermove', 'r1', 20, 250); ptr('pointermove', 'r1', 20, 350);
ok(JSON.stringify(get('S.sel.ids')) === '["r1","r2","r3"]', 'そのままなぞると、通った行が選ばれる');
docH.pointerup({}); await sleep(380);
// 選ばれている行から始めると、なぞった行の選択を外す
ptr('pointerdown', 'r3', 20, 350, { chk: true });
ok(JSON.stringify(get('S.sel.ids')) === '["r1","r2"]', '選ばれている行から始めると、その行の選択が外れる');
ptr('pointermove', 'r3', 20, 250);
ok(JSON.stringify(get('S.sel.ids')) === '["r1"]', 'なぞった行の選択も、まとめて外れる');
docH.pointerup({}); await sleep(380);
// 選んだ行へ、まとめて操作
loadRows(); run('S.sel={on:true,ids:["r1","r2"]}'); cl('sel-confirm');
ok(get("S.overlay.edits.r1.status") === 'confirmed' && get("S.overlay.edits.r2.status") === 'confirmed', 'なぞって選んだ行を、「確認済み」にまとめて操作できる');

// ufj real rules: 実際のUFJのCSVに出てくる入金・引き出しの扱い
run('S.settings.ufjIncomeKw=["給料","プレモ","サンプル商事"]; S.settings.ufjP2pKw=["ヤマダ"]; S.settings.ufjIncomeOnly=true; S.settings.transfer=true');
run('S.base=' + JSON.stringify([
  T('カ）サンプル商事', 63995, { id: 'u1' }), T('ヤマダ　タロウ', 264970, { id: 'u2' }), T('カ）プレモ', 94015, { id: 'u3' }), T('給料', 17314, { id: 'u4' }),
  T('８ネン　３ガツブン', 322, { id: 'u5' }), T('カイガイデヒ', 1200, { id: 'u6' }),
  T('カードＣ１', -90000, { id: 'u7', type: '支払い' }), T('カードＢ１', -60000, { id: 'u8', type: '支払い' }),
  T('スイカ　ケイタイ', -1000, { id: 'u9', type: '振替支払い' }), T('アツプルドツ', -450, { id: 'u10', type: '振替支払い' }), T('ジエイア－ルヒ', -26120, { id: 'u11', type: '振替支払い' }), T('コミユニテイサイ', -330, { id: 'u12', type: '振替支払い' }),
]));
m = by();
ok(m['カ）サンプル商事'].group === 'main' && m['カ）サンプル商事'].category === '収入', 'UFJ: 「サンプル商事」からの入金は、給料(収入)になる');
ok(m['ヤマダ　タロウ'].group === 'p2p' && m['ヤマダ　タロウ'].category === 'お小遣い' && m['ヤマダ　タロウ'].value === 264970, 'UFJ: 「ヤマダ」からの入金は、お小遣い(収入の中)になる');
ok(m['カ）プレモ'].group === 'main' && m['給料'].group === 'main', 'UFJ: 「プレモ」「給料」は、収入のまま');
ok(m['８ネン　３ガツブン'].group === 'nonincome' && m['カイガイデヒ'].group === 'nonincome', 'UFJ: 利息(〇ネン〇ガツブン)や返金は、収入以外');
ok(m['カードＣ１'].group === 'transfer' && m['カードＢ１'].group === 'transfer', 'UFJ: ATMの引き出し(カードＣ１・Ｂ１)は、振替になる');
ok(get('exp(all())') === 1000 + 450 + 26120 + 330, 'ATMの引き出しは、支出の合計に入らない');
ok(get('inc(all())') === 63995 + 264970 + 94015 + 17314, '収入の合計は、サンプル商事・ヤマダ(個人間送金)・プレモ・給料');
run('S.settings.transfer=false');
ok(get('exp(all())') === 1000 + 450 + 26120 + 330 + 150000, '「引き出しを収支から除く」をオフにすると、ATMの引き出しも支出に入る');
run('S.settings.transfer=true');
ok(m['アツプルドツ'].category === '娯楽' && m['ジエイア－ルヒ'].category === '交通' && m['コミユニテイサイ'].category === '交通' && m['スイカ　ケイタイ'].category === '交通', 'UFJの古い書き方(アツプル・ジエイア－ル・コミユニテイ)も、分類できる');
// 設定の移行: すでに使っている人にも「サンプル商事」「ヤマダ」が入る
ok(get("kn('Ｕ－ＮＥＸＴ')") === 'Uーnext'.replace('n', 'N').replace('ext', 'EXT') || get("kn('ＡＢ')") === 'AB', '店名の書き方をそろえる関数が動く');
ok(get("RULES_N.some(([c,re])=>re.test(kn('カードＣ１'))) === false"), 'ATMの引き出しは、支出のカテゴリーの自動分類には使われない');
const sv2 = get('viewSync(all())');
ok(sv2.includes('個人間送金(人から受け取ったお金)の言葉') && sv2.includes('ヤマダ') && sv2.includes('サンプル商事') && sv2.includes('data-k="p2p"'), '設定に「個人間送金の言葉」の一覧があり、言葉を追加・削除できる');
cl('kw-add', { k: 'p2p' }); const sh2 = made.at(-1); sh2.querySelector = () => ({ value: 'タナカ' });
sh2.handlers.click({ target: { closest: s => s === '[data-save]' ? {} : null } });
ok(get('S.settings.ufjP2pKw').includes('タナカ'), '個人間送金の言葉を追加できる');
cl('kw-del', { k: 'p2p', i: '0' });
ok(!get('S.settings.ufjP2pKw').includes('ヤマダ') && get('S.settings.ufjP2pKw').includes('タナカ'), '個人間送金の言葉を削除できる');
// 設定: 題名を押すと開く
run('S.setOpen={}');
const fv = get('viewSync(all())');
ok(['csv','income','cat','theme','cloud','agg','subs'].every(k => fv.includes(`data-act="set-toggle" data-k="${k}"`)) && !/class="card fold open"|class="fold open"/.test(fv), '設定: CSV・収入の判定・カテゴリー・背景色・クラウド・集計設定・サブスクが、題名のボタンになり、最初は閉じている');
cl('set-toggle', { k: 'income' });
ok(/class="card fold open"><button class="foldhd" data-act="set-toggle" data-k="income"/.test(get('viewSync(all())')) && !/fold open"><button class="foldhd" data-act="set-toggle" data-k="csv"/.test(get('viewSync(all())')), '設定: 題名を押すと、そのメニューだけが開く');
cl('set-toggle', { k: 'income' });
ok(!/fold open"><button class="foldhd" data-act="set-toggle" data-k="income"/.test(get('viewSync(all())')), '設定: もう一度押すと閉じる');

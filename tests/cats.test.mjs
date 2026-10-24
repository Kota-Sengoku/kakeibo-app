import fs from 'fs';
import vm from 'vm';

const APP = new URL('../src/index.html', import.meta.url);
let html = fs.readFileSync(APP, 'utf8');
// グラフの色の補正(削除済みカテゴリーでも色が出るように)
html = html.replace('stroke="${CATS[k]}"', 'stroke="${CATS[k]||CATS[\'その他\']}"');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) process.exitCode = 1; };
const made = [];
const el = () => {
  const kids = {}, handlers = {};
  const e = { className: '', innerHTML: '', textContent: '', style: {}, dataset: {}, classList: { toggle() {} }, kids, handlers,
    addEventListener(t, f) { handlers[t] = f; }, remove() { this.removed = true; }, appendChild() {}, querySelectorAll() { return []; },
    querySelector(sel) { return kids[sel] ??= { value: '', textContent: '', style: {} }; } };
  made.push(e); return e;
};
const store = new Map();
const ctx = vm.createContext({ console, TextDecoder, TextEncoder, DataView, Uint8Array, Int32Array, Date, JSON, Math, Promise, Set, Map, URL, encodeURIComponent, decodeURIComponent, parseInt, setTimeout, clearTimeout, Intl, Object, Array, String, Number, Error, RegExp, isNaN, escape, atob,
  setInterval() {}, fetch: async () => { throw new Error('no net'); }, confirm: () => true,
  document: { documentElement: { style: { setProperty() {} } }, getElementById: () => el(), addEventListener(t, f) { (globalThis.__docHandlers ??= {})[t] = f; }, createElement: el, body: { appendChild() {} }, querySelector: () => null, hidden: false },
  window: { scrollTo() {}, addEventListener() {} }, location: { hostname: 'x.github.io', hash: '', pathname: '/', protocol: 'https:' }, history: { replaceState() {} }, navigator: {},
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }, indexedDB: undefined });
vm.runInContext(script, ctx);
const get = c => vm.runInContext(c, ctx);
const T = (m, v = -500) => ({ id: 'id_' + m, date: '2026/10/10 12:00:00', amount: String(Math.abs(v)), amount_value: v, merchant: m, transaction_type: '支払い', status: 'confirmed', source: 'paypay_csv', raw: '' });
const classify = list => { vm.runInContext('S.base=' + JSON.stringify(list.map(m => T(m))), ctx); return Object.fromEntries(get('all()').map(t => [t.merchant, t])); };

// --- 指定された自動分類 ---
const m1 = classify(['Yahoo!ショッピング', 'ＹＡＨＯＯ！ショッピング', 'シァル横浜', 'ＣＩＡＬ桜木町', '東京国立博物館', '国立西洋美術館', 'スタバ 渋谷店', 'スターバックスコーヒー', 'STARBUCKS COFFEE', 'ドトールコーヒー', 'タリーズ', '近所のよく分からない店']);
ok(m1['Yahoo!ショッピング'].category === '娯楽' && m1['ＹＡＨＯＯ！ショッピング'].category === '娯楽', 'Yahoo!ショッピング → 娯楽(全角でも)');
ok(m1['シァル横浜'].category === '食費' && m1['ＣＩＡＬ桜木町'].category === '食費', 'シァル → 食費');
ok(m1['東京国立博物館'].category === '旅行' && m1['国立西洋美術館'].category === '旅行', '博物館・美術館 → 旅行');
ok(['スタバ 渋谷店', 'スターバックスコーヒー', 'STARBUCKS COFFEE', 'ドトールコーヒー', 'タリーズ'].every(k => m1[k].category === '食費'), 'スタバ・ドトール・タリーズ → 食費');
ok(m1['近所のよく分からない店'].category === '食費' && m1['近所のよく分からない店'].review === true, '判定できない店は、仮に「食費」で、要確認に入る');
ok(m1['Yahoo!ショッピング'].review === false && m1['東京国立博物館'].review === false, '判定できた店は、要確認にならない');
ok(get('CAT_NAMES').includes('旅行') && get('CAT_NAMES').at(-1) === 'その他', '「旅行」が追加され、「その他」は最後のまま');

// --- カテゴリーの追加(シートの操作を再現) ---
get('openCategorySheet()'); let sheet = made.at(-1);
sheet.querySelector('#nc-name').value = '趣味'; sheet.querySelector('#nc-color').value = '#6B8E4E';
sheet.handlers.click({ target: { closest: s => s === '[data-save]' ? {} : null } });
ok(get('CAT_NAMES').includes('趣味') && get("CATS['趣味']") === '#6B8E4E' && get('CAT_NAMES').at(-1) === 'その他', 'カテゴリー「趣味」を追加できる(色つき、「その他」は最後)');
get('openCategorySheet()'); sheet = made.at(-1); sheet.querySelector('#nc-name').value = '趣味';
const before = get('S.settings.cats.length'); sheet.handlers.click({ target: { closest: s => s === '[data-save]' ? {} : null } });
ok(get('S.settings.cats.length') === before, '同じ名前のカテゴリーは追加できない');

// --- ルールの追加と、過去の取引への自動反映 ---
const m2a = classify(['ヨガスタジオクラブ会費', 'ライフ']);
ok(m2a['ヨガスタジオクラブ会費'].review === true, '(追加前)ルールがないので、仮のカテゴリーで要確認');
get('openRuleSheet()'); sheet = made.at(-1);
sheet.querySelector('#nr-kw').value = 'ヨガスタジオ';
sheet.handlers.click({ target: { closest: s => s === '[data-cat]' ? { dataset: { cat: '趣味' } } : null } });
sheet.handlers.click({ target: { closest: s => s === '[data-save]' ? {} : null } });
const m2 = Object.fromEntries(get('all()').map(t => [t.merchant, t]));
ok(m2['ヨガスタジオクラブ会費'].category === '趣味' && m2['ヨガスタジオクラブ会費'].review === false, 'ルール「ヨガスタジオ→趣味」を足すと、すでにある取引にも自動で反映される');
get('openRuleSheet()'); sheet = made.at(-1); sheet.querySelector('#nr-kw').value = 'ライフ';
sheet.handlers.click({ target: { closest: s => s === '[data-cat]' ? { dataset: { cat: '日用品' } } : null } });
sheet.handlers.click({ target: { closest: s => s === '[data-save]' ? {} : null } });
ok(Object.fromEntries(get('all()').map(t => [t.merchant, t]))['ライフ'].category === '日用品', '自分で足したルールが、組み込みのルール(ライフ→食費)より優先される');

// --- 手で選んだカテゴリーは、ルールより優先 ---
vm.runInContext("S.overlay.edits['id_ライフ']={category:'娯楽'}", ctx);
ok(Object.fromEntries(get('all()').map(t => [t.merchant, t]))['ライフ'].category === '娯楽', '手で選んだカテゴリーは、ルールが変わっても変わらない');
vm.runInContext("delete S.overlay.edits['id_ライフ']", ctx);

// --- 仮のカテゴリーを変える ---
vm.runInContext("S.settings.fallbackCat='日用品'", ctx);
ok(classify(['謎の店'])['謎の店'].category === '日用品', '仮のカテゴリーを変えられる(初期は食費)');
vm.runInContext("S.settings.fallbackCat='食費'", ctx);

// --- カテゴリーの削除: ルールと予算も消え、取引は判定し直される ---
classify(['ヨガスタジオクラブ会費', 'ライフ']);
vm.runInContext("S.settings.budgets={趣味:5000,食費:30000}", ctx);
const view = get('viewSync(all())');
ok(view.includes('カテゴリーと自動分類') && view.includes('「ヨガスタジオ」') && view.includes('data-act="cat-del"'), '設定タブに、カテゴリーとルールの一覧・削除ボタンが出る');
const clickBtn = (act, data) => globalThis.__docHandlers.click({ target: { closest: sel => sel === '[data-act]' ? { dataset: { act, ...data } } : null } });
clickBtn('cat-del', { n: '趣味' });   // 実際の削除ボタンの処理
ok(!get('CAT_NAMES').includes('趣味') && get('S.settings.rules.some(r=>r.cat==="趣味")') === false && get('S.settings.budgets.趣味') === undefined, 'カテゴリーを消すと、そのルールと予算も消える');
const m3 = Object.fromEntries(get('all()').map(t => [t.merchant, t]));
ok(m3['ヨガスタジオクラブ会費'].review === true && get("CATS[all().find(t=>t.merchant==='ヨガスタジオクラブ会費').category]") !== undefined, '消えたカテゴリーの取引は、判定し直されて要確認に戻る');
ok(get('donut([["趣味",1000]],1000)').includes('stroke="#6B6585"') || get('donut([["趣味",1000]],1000)').includes('undefined') === false, '削除済みカテゴリーでも、グラフの色が壊れない');

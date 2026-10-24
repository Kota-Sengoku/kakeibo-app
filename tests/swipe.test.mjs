import fs from 'fs';
import vm from 'vm';

const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) process.exitCode = 1; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const made = [];
const el = () => {
  const kids = {}, handlers = {};
  const e = { className: '', innerHTML: '', textContent: '', style: {}, dataset: {}, classList: { toggle() {}, remove() {} }, kids, handlers,
    addEventListener(t, f) { handlers[t] = f; }, remove() { this.removed = true; }, appendChild() {}, querySelectorAll() { return []; },
    querySelector(sel) { return kids[sel] ??= { value: '', textContent: '', style: {} }; } };
  made.push(e); return e;
};
const store = new Map(), docH = {};
const ctx = vm.createContext({ console, TextDecoder, TextEncoder, DataView, Uint8Array, Int32Array, Date, JSON, Math, Promise, Set, Map, URL, encodeURIComponent, decodeURIComponent, parseInt, setTimeout, clearTimeout, Intl, Object, Array, String, Number, Error, RegExp, isNaN, escape, atob,
  setInterval() {}, fetch: async () => { throw new Error('no net'); }, confirm: () => true,
  document: { documentElement: { style: { setProperty() {} } }, getElementById: () => el(), addEventListener(t, f) { docH[t] = f; }, createElement: el, body: { appendChild() {} }, querySelector: () => null, hidden: false },
  window: { scrollTo() {}, addEventListener() {} }, location: { hostname: 'x.github.io', hash: '#/history', pathname: '/', protocol: 'https:' }, history: { replaceState() {} }, navigator: {},
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }, indexedDB: undefined });
vm.runInContext(script, ctx);
const get = c => vm.runInContext(c, ctx);
const run = c => vm.runInContext(c, ctx);

const T = (m, v = -500) => ({ id: 'id_' + m, date: '2026/10/10 12:00:00', amount: String(Math.abs(v)), amount_value: v, merchant: m, transaction_type: v > 0 ? '振替入金' : '支払い', status: 'confirmed', source: 'paypay_csv', raw: '' });
const reset = () => { run('S.base=' + JSON.stringify([T('ふしぎA'), T('ふしぎB'), T('ふしぎC'), T('ライフ'), T('給料', 180000)]) + '; S.overlay={edits:{},added:[],deleted:[]}; S.learned={}; S.sel={on:false,ids:[]}; S.hist.filter="review"'); };
const reviewCount = () => get('all().filter(t=>t.review).length');
const fgOf = id => ({ dataset: { id }, style: {}, offsetWidth: 320, parentElement: { classList: { toggle() {}, remove() {} } } });
const swipe = async (id, dx, dy = 3) => {
  const fg = fgOf(id);
  docH.pointerdown({ target: { closest: s => s === '.swipeable' ? fg : (s === 'button,a' ? {} : null) }, clientX: 200, clientY: 100, pointerType: 'touch' });
  docH.pointermove({ clientX: 200 + dx, clientY: 100 + dy });
  const mid = fg.style.transform;
  docH.pointerup({}); await sleep(320);
  return { fg, mid };
};
const click = (act, data = {}) => docH.click({ target: { closest: s => s === '[data-act]' ? { dataset: { act, ...data } } : null } });

// --- 表示 ---
reset();
const view = get('viewHistory(all())');
ok((view.match(/class="tx swipeable"/g) || []).length === 3, '要確認の3行だけが、スライドできる行になっている');
ok(!view.includes('data-id="id_ライフ"') && view.includes('横にスライドすると'), '確認済みの行は一覧に出ず、スライドの説明が出る');
ok(get('viewHistory(all())').includes('data-act="sel-toggle">選択<'), '「選択」ボタンがある');

// --- 横にスライド → 確認済み ---
const r1 = await swipe('id_ふしぎA', -140);
ok(r1.mid === 'translateX(-140px)', 'スライドに合わせて、行が指についてくる');
ok(JSON.stringify(get("S.overlay.edits['id_ふしぎA']")) === '{"status":"confirmed","category":"食費"}', '90px以上スライドすると、確認済みになる(いまのカテゴリーで確定)');
ok(reviewCount() === 2, '要確認の件数が3→2件に減り、一覧から消える');
ok(get("S.learned[nk('ふしぎA')]") === '食費', '確認した店名は、次回から同じカテゴリーになる');
const before = made.length;
click('edit', { id: 'id_ふしぎB' });
ok(made.length === before, 'スライドの直後は、編集画面が開かない(誤タップ防止)');
await sleep(400);
click('edit', { id: 'id_ふしぎB' });
ok(made.length > before, '少し時間が空けば、普通のタップで編集画面が開く');

// --- 元に戻す ---
const undoBtn = made.filter(e => e.textContent === '元に戻す').at(-1);
ok(!!undoBtn && typeof undoBtn.onclick === 'function', '通知に「元に戻す」ボタンが出る');
undoBtn.onclick();
ok(reviewCount() === 3 && get("S.learned[nk('ふしぎA')]") === undefined, '「元に戻す」で、要確認に戻り、学習も取り消される');

// --- 小さなスライド・縦の動きでは、何も起きない ---
const r2 = await swipe('id_ふしぎB', -30);
ok(reviewCount() === 3 && r2.fg.style.transform === '', '30pxだけのスライドは、元の位置に戻る(確認済みにならない)');
const r3 = await swipe('id_ふしぎB', -10, 80);
ok(reviewCount() === 3, '縦にスクロールしたときは、確認済みにならない');
const r4 = await swipe('id_ふしぎB', 140);
ok(reviewCount() === 2, '右へのスライドでも、確認済みになる');
await sleep(400);
reset();

// --- まとめて選択 ---
click('sel-toggle');
let v = get('viewHistory(all())');
ok(get('S.sel.on') === true && v.includes('class="selbar"') && v.includes('data-act="sel-row"') && !v.includes('swipeable'), '「選択」を押すと、選択モードになる(スライドは無効)');
ok(v.includes('0件選択中') && v.includes('class="off" data-act="sel-confirm"'), '何も選んでいないときは、操作ボタンが押せない');
click('sel-row', { id: 'id_ふしぎA' }); click('sel-row', { id: 'id_ふしぎB' });
ok(get('S.sel.ids.length') === 2 && get('viewHistory(all())').includes('2件選択中'), '行をタップして、選べる(2件選択中)');
click('sel-row', { id: 'id_ふしぎB' });
ok(get('S.sel.ids.length') === 1, 'もう一度タップすると、選択が外れる');
click('sel-all');
ok(get('S.sel.ids.length') === 3, '「すべて選択」で、表示中の3件を選べる');
click('sel-all');
ok(get('S.sel.ids.length') === 0, 'もう一度押すと、すべて解除される');
get('app.innerHTML').includes('class="fab"');
run('render()');
ok(!get('app.innerHTML').includes('class="fab"'), '選択中は、右下の「+」ボタンを隠す');
click('sel-all'); click('sel-confirm');
ok(reviewCount() === 0 && get('S.sel.ids.length') === 0, '「確認済み」で、選んだ3件がまとめて確認済みになる');
made.filter(e => e.textContent === '元に戻す').at(-1).onclick();
ok(reviewCount() === 3, 'まとめて確認済みにしたものも、「元に戻す」で戻せる');

// カテゴリーをまとめて変更
click('sel-row', { id: 'id_ふしぎA' }); click('sel-row', { id: 'id_ふしぎC' });
click('sel-cat');
const sheet = made.at(-1);
ok(sheet.innerHTML.includes('2件を、選んだカテゴリー') && sheet.innerHTML.includes('data-cat="交通"'), '「カテゴリー」で、カテゴリーを選ぶ画面が開く');
sheet.handlers.click({ target: { closest: s => s === '[data-cat]' ? { dataset: { cat: '交通' } } : null } });
const m = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(m['id_ふしぎA'].category === '交通' && m['id_ふしぎC'].category === '交通' && m['id_ふしぎB'].review === true, '選んだ2件だけが「交通」になり、確認済みになる(残りは要確認のまま)');
ok(get("S.learned[nk('ふしぎA')]") === '交通', 'まとめて選んだカテゴリーも、次回から自動で使われる');

// 削除
click('sel-row', { id: 'id_ふしぎB' }); click('sel-del');
ok(get("S.overlay.deleted.includes('id_ふしぎB')") && !get('all()').some(t => t.id === 'id_ふしぎB'), '「削除」で、選んだ取引が消える');
click('sel-toggle');
ok(get('S.sel.on') === false, '「完了」で、選択モードが終わる');
ok(get('viewHistory(all())').includes('data-act="sel-toggle">選択<'), 'ボタンが「選択」に戻る');

// --- 押した感触(CSS) ---
ok(['.btn:active{transform:scale(.97)', '.chip:active{transform:scale(.94)', '.icon-btn:active{transform:scale(.88)', '.fab:active{transform:scale(.9)', '.nav a:active{transform:scale(.9)', '.tx:active{background:var(--nav)}'].every(c => html.includes(c)), '押した感触: ボタン・チップ・アイコン・+ボタン・下のメニュー・行に、押したときの見た目がある');
ok(typeof docH.touchstart === 'function', '押した感触: iPhoneで、押している間の見た目が有効になる設定がある');

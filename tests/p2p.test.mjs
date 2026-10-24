import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { pathToFileURL } from 'url';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) process.exitCode = 1; };

/* ---- アプリ ---- */
const html = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const el = () => ({ className: '', innerHTML: '', dataset: {}, addEventListener() {}, remove() {}, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
const store = new Map();
const ctx = vm.createContext({ console, TextDecoder, TextEncoder, Date, JSON, Math, Promise, Set, Map, URL, encodeURIComponent, decodeURIComponent, parseInt, setTimeout, clearTimeout, Intl, Object, Array, String, Number, Error, RegExp, isNaN, escape, atob,
  setInterval() {}, fetch: async () => { throw new Error('no net'); },
  document: { documentElement: { style: { vars: {}, setProperty(k, v) { this.vars[k] = v; } } }, getElementById: () => el(), addEventListener() {}, createElement: el, body: { appendChild() {} }, querySelector: () => null, hidden: false },
  window: { scrollTo() {}, addEventListener() {} }, location: { hostname: 'x.github.io', hash: '', pathname: '/', protocol: 'https:' }, history: { replaceState() {} }, navigator: {},
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }, indexedDB: undefined });
vm.runInContext(script, ctx);
vm.runInContext('S.settings.ufjIncomeKw=["給料","プレモ","サンプル商事"]; S.settings.ufjP2pKw=["ヤマダ"]; S.settings.allowKw=["ヤマダ","山田花子","山田太郎","090******00"];', ctx);
const get = c => vm.runInContext(c, ctx);
const B = (id, merchant, v, extra = {}) => ({ id, date: '2026/10/12 14:48:00', amount: String(Math.abs(v)), amount_value: v, merchant, transaction_type: extra.type || '支払い', status: 'confirmed', source: extra.source || 'paypay_ocr', raw: '' });
vm.runInContext('S.base=' + JSON.stringify([
  B('a', 'たにぐちゆいさんに送る', -1350),
  B('b', 'たにぐちゆいさんから受け取る', 1000),
  B('c', 'さとうさんから受け取る', -500),          // 符号が逆でも収入にそろう
  B('d', 'さとうさんに送る', 700),                  // 符号が逆でも支出にそろう
  B('e', 'マクドナルド', -790),
]), ctx);
const m = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(m.a.value === -1350 && m.a.type === '送った金額', '「〇〇さんに送る」は支出(-1,350)');
ok(m.b.value === 1000 && m.b.type === '受け取った金額', '「〇〇さんから受け取る」は収入(+1,000)');
ok(m.c.value === 500 && m.d.value === -700, '符号が逆に入っていても店名の向きにそろう');
ok(!get('all().some(t=>t.review&&t.merchant.includes("さん"))'), '個人間送金は「要確認」にならない');
ok(get('inc(all())') === 0 && get('exp(all())') === 1350 + 700 + 790 - 790, '収入・支出の合計: 「お小遣いの人」以外から受け取った1,500円は立替金で、収入に入らず、マクドナルド(790円)まで相殺される');
vm.runInContext('S.settings.p2pIn=false', ctx);
ok(get('inc(all())') === 0 && get('exp(all())') === 790, '設定でオフにすると、個人間送金は集計から外れる');

/* ---- 中継役 ---- */
const tmp = path.join(here, 'w_p2p.mjs');
fs.copyFileSync(new URL('../src/worker.js', import.meta.url), tmp);
const w = (await import(pathToFileURL(tmp).href)).default; fs.unlinkSync(tmp);
const RT = s => ({ rich_text: s ? [{ plain_text: s }] : [] });
const page = (m, num) => ({ id: 'aaaaaaaa-0000-0000-0000-000000000001', properties: { merchant: { title: [{ plain_text: m }] }, amount: RT('1,350円'), amount_value: { number: num }, date: RT('2026/10/12'), captured_at: RT(''), raw: RT(''), status: { select: { name: 'confirmed' } }, source: { select: { name: 'paypay_ocr' } }, tx_id: RT(''), transaction_type: RT(''), category: RT(''), deleted: { checkbox: false } } });
globalThis.fetch = async () => new Response(JSON.stringify({ results: [page('たにぐちゆいさんに送る', null), page('たにぐちゆいさんから受け取る', null)], has_more: false }));
const env = { APP_KEY: 'k'.repeat(20), NOTION_TOKEN: 't', DATABASE_ID: 'db' };
const r = await (await w.fetch(new Request('https://x/api/transactions', { headers: { 'X-App-Key': env.APP_KEY } }), env)).json();
ok(r.records[0].amount_value === -1350 && r.records[0].transaction_type === '送った金額', '中継役: 「送る」は-1,350・種別「送った金額」');
ok(r.records[1].amount_value === 1350 && r.records[1].transaction_type === '受け取った金額', '中継役: 「受け取る」は+1,350・種別「受け取った金額」');
// OCR: 画面上部の電波表示(「• 4G O」)を店名にしない
vm.runInContext('S.base=' + JSON.stringify([
  { id: 'o1', date: '2026年10月18日18時36分', amount: '4,741円', amount_value: -4741, merchant: '• 4G O', transaction_type: '支払い', status: 'confirmed', source: 'paypay_ocr', raw: '18:45/ • 4G O/ いなせ寿司/ 弘明寺店/ 2026年10月18日 18時36分/ 4,741円の/' },
  { id: 'o2', date: '', amount: '100円', amount_value: -100, merchant: 'ローソン', transaction_type: '支払い', status: 'confirmed', source: 'paypay_ocr', raw: '18:45/ ローソン/' },
]), ctx);
const mo = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(mo.o1.merchant === 'いなせ寿司', 'OCR: 「• 4G O」ではなく、「いなせ寿司」が店名になる(' + mo.o1.merchant + ')');
ok(mo.o2.merchant === 'ローソン', 'OCR: ふつうの店名は、そのまま');
// レポート: 収入の内訳(給与)
const mk = (id, day, merchant, v, extra = {}) => ({ id, date: day + ' 10:00:00', amount: String(Math.abs(v)), amount_value: v, merchant, transaction_type: v > 0 ? '振替入金' : '支払い', status: 'confirmed', source: extra.source || 'ufj_csv', raw: '' });
vm.runInContext('S.settings.ufjIncomeKw=["給料","プレモ","サンプル商事"]; S.settings.ufjP2pKw=["ヤマダ"]; S.settings.ufjIncomeOnly=true; S.settings.p2pIn=true; S.base=' + JSON.stringify([
  mk('i1', '2026/10/15', '給料', 17314), mk('i2', '2026/09/25', 'カ）プレモ', 94015), mk('i3', '2026/10/03', 'ヤマダ　タロウ', 30000), mk('i4', '2026/10/04', 'アマゾン', -500),
]), ctx);
const iv = get('incomeCard(all().filter(t=>t.day.startsWith("2026-10")),"収入の内訳")');
ok(iv.includes('給与・収入') && iv.includes('給料') && iv.includes('17,314') && iv.includes('お小遣い') && iv.includes('30,000') && !iv.includes('プレモ'), 'レポート: 収入の内訳に、給与・収入と個人間送金が分かれて出る(当月分のみ)');
const sb = get('salaryBars(["2026-09","2026-10"], all())');
ok(sb.includes('給与・収入の月別') && sb.includes('9月') && sb.includes('10月'), 'レポート: 給与・収入の月別グラフが出る');
ok(get('salaryOf(all())') === 17314 + 94015, 'レポート: 給与・収入の合計に、個人間送金は入らない');
ok(get('viewStats(all(),"month")').includes('収入の内訳') && get('viewStats(all(),"year")').includes('収入の内訳') && get('viewStats(all(),"all")').includes('収入の内訳'), 'レポート: 月間・年間・全期間のどれにも、収入の内訳がある');
// Yahoo!トラベルの返金は「その他収入」
vm.runInContext('S.base=' + JSON.stringify([
  { id: 'y1', date: '2026/03/05 06:59:25', amount: '20,170', amount_value: 20170, merchant: 'Yahoo!トラベル', transaction_type: '返金', status: 'confirmed', source: 'paypay_csv', raw: '' },
  { id: 'y2', date: '2026/03/06 10:00:00', amount: '1,000', amount_value: 1000, merchant: 'メルカリ', transaction_type: '返金', status: 'confirmed', source: 'paypay_csv', raw: '' },
]), ctx);
const my = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(my.y1.category === 'その他収入' && my.y1.value === 20170 && my.y1.group === 'main', 'Yahoo!トラベルの返金は、「その他収入」(収入として数える)');
ok(my.y2.category === '収入', 'ほかの返金は、これまでどおり「収入」');
ok(get('salaryOf(all())') === 1000, '給与・収入の月別・合計には、その他収入は入らない');
ok(get('incomeCard(all(),"収入の内訳")').includes('その他収入'), 'レポートの収入の内訳に、「その他収入」が別に出る');
// 相殺
const P = (id, day, mer, v, type = '支払い', src = 'paypay_csv') => ({ id, date: day + ' 12:00:00', amount: String(Math.abs(v)), amount_value: v, merchant: mer, transaction_type: type, status: 'confirmed', source: src, raw: '' });
vm.runInContext('S.settings.offsets={}; S.base=' + JSON.stringify([
  P('t_pay', '2026/01/27', 'Yahoo!トラベル', -20170), P('t_ref', '2026/03/05', 'Yahoo!トラベル', 20170, '返金'),
  P('d_pay', '2026/02/10', '居酒屋', -12000), P('d_f1', '2026/02/11', 'たにぐち', 4000, '受け取った金額'), P('d_f2', '2026/02/12', 'さえき', 4000, '受け取った金額'),
  P('m1', '2026/02/15', 'マクドナルド', -790),
]), ctx);
let aa = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(aa.t_ref.offsetOf === 't_pay', '相殺: 返金は、同じ店・同じ金額の支払いと自動で結びつく');
ok(get('exp(all().filter(t=>t.day.startsWith("2026-01")||t.day.startsWith("2026-03")))') === 0 && get('inc(all().filter(t=>t.day.startsWith("2026-03")))') === 0, '相殺: 支出(1月の支払い)も収入(3月の返金)も、合計が0になる');
ok(get('exp(all())') === 12000 + 790 - 8000, '相殺: 友達の返金(各4,000円)は、直前の居酒屋(12,000円)の支払いから、自動で引かれる(' + get('exp(all())') + ')')
vm.runInContext('S.settings.offsets={d_f1:"d_pay", d_f2:"d_pay"}', ctx);
aa = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(aa.d_f1.offsetOf === 'd_pay' && aa.d_f2.offsetOf === 'd_pay', '相殺: 友達2人の返金を、同じ居酒屋の支払いに結びつけられる');
ok(get('exp(all())') === 12000 - 8000 + 790, `相殺: 支出が自己負担額(12,000-8,000+790=${12000 - 8000 + 790})になる(${get('exp(all())')})`);
ok(get('inc(all())') === 0, '相殺: 友達からの返金は、収入に数えない');
ok(get('spendByCat(all())')[aa.d_pay.category] === 12000 - 8000 + (aa.m1.category === aa.d_pay.category ? 790 : 0), '相殺: カテゴリー別の支出も、その支払いのカテゴリーから引かれる');
vm.runInContext('S.settings.offsets={t_ref:""}', ctx);
aa = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(!aa.t_ref.offsetOf && get('inc(all())') >= 20170, '相殺: 「相殺をやめる」と、自動の結びつけも外れ、収入に戻る');
ok(get('viewSync(all())').length > 0 && get('openOffsetPicker') !== undefined, '相殺: 画面と選択シートの関数がある');

// 立替金とお小遣い
const Q = (id, day, mer, v, type = '支払い') => ({ id, date: day + ' 12:00:00', amount: String(Math.abs(v)), amount_value: v, merchant: mer, transaction_type: type, status: 'confirmed', source: 'paypay_csv', raw: '' });
vm.runInContext('S.settings.offsets={}; S.settings.alloc={}; S.settings.allowKw=["ヤマダ","山田花子","山田太郎","090******00"]; S.settings.p2pIn=true; S.base=' + JSON.stringify([
  Q('g_meal', '2026/05/01', 'ガスト', -3200),
  Q('g_r1', '2026/05/03', 'たにぐち', 1600, '受け取った金額'),          // 3,200円以下 → 立替金
  Q('g_r2', '2026/05/04', 'さえき', 1600, '受け取った金額'),            // 残りの1,600円にも収まる → 立替金
  Q('g_r3', '2026/05/05', '山田花子', 20000, '受け取った金額'),         // お小遣いの人 → お小遣い
  Q('g_old', '2026/03/01', 'ガスト', -2000), Q('g_r4', '2026/04/10', '山田太郎', 1000, '受け取った金額'),   // 3週間より前の支払い → お小遣い
  Q('g_mer', '2026/06/01', 'すき家', -2000), Q('g_r5', '2026/06/02', 'しげみ', 5000, '受け取った金額'),
  Q('g_u', '2026/07/01', 'ココイチ', -3000), Q('g_r6', '2026/07/02', 'たにぐち', 1000, '受け取った金額'),
]), ctx);
let gg = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(gg.g_r1.category === '立替金' && gg.g_r1.offsetOf === 'g_meal' && gg.g_r2.offsetOf === 'g_meal', '立替金: 食費の支払い以下の受け取りは「立替金」になり、直前の支払いから引く(2人分)');
ok(gg.g_r3.category === 'お小遣い' && gg.g_r3.incAmt === 20000 && !gg.g_r3.offsetOf, 'お小遣い: 「お小遣いの人」(山田花子)からのお金は、全額「お小遣い」(収入)');
ok(gg.g_r4.category === 'お小遣い', 'お小遣い: 「お小遣いの人」(山田太郎)からのお金は、飲食店の支払いがなくてもお小遣い');
ok(gg.g_r5.category === '立替金' && gg.g_r5.incAmt === 0 && gg.g_r5.offAmt === 2000 && gg.g_r5.advance - gg.g_r5.offAmt === 3000, 'お小遣いの人以外からの5,000円は、お小遣いにならず立替金。すき家(2,000円)まで相殺し、残り3,000円は未相殺');
ok(get('exp(all().filter(t=>t.day.startsWith("2026-05")))') === 3200 - 1600 - 1600, '立替金: 5月の支出が、3,200 - 1,600 - 1,600 = 0円になる');
ok(get('inc(all().filter(t=>t.day.startsWith("2026-05")))') === 20000, '立替金は収入に数えない(5月の収入は、お小遣い20,000円だけ)');
// 金額を分ける(20,000円のうち3,200円は立替金、あとはお小遣い)
vm.runInContext('S.settings.alloc={g_r3:16800}', ctx);
vm.runInContext('S.base.push(' + JSON.stringify(Q('g_meal2', '2026/05/05', '寿司屋', -3200)) + ')', ctx);
gg = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(gg.g_r3.allowance === 16800 && gg.g_r3.advance === 3200 && gg.g_r3.incAmt === 16800, '分割: 20,000円のうち、16,800円をお小遣い、3,200円を立替金にできる');
ok(gg.g_r3.offsetOf === 'g_meal2' && gg.g_r3.offAmt === 3200, '分割: 立替金の3,200円は、直前の食費の支払いから引かれる');
ok(get('inc(all().filter(t=>t.day.startsWith("2026-05")))') === 16800, '分割: 収入に入るのは、お小遣いの16,800円だけ');
vm.runInContext('S.settings.alloc={g_r3:20000}', ctx);
gg = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(gg.g_r3.advance === 0 && gg.g_r3.category === 'お小遣い', '分割: 全額をお小遣いにもできる');
ok(get('advanceCard(all(),"立替金")').includes('立替金') && get('openOffsetPicker') !== undefined, '立替金: レポートのカードがある');
// サブスクは、カテゴリー「サブスク」
const SBX = (id, day, mer, v) => ({ id, date: day + ' 12:00:00', amount: String(Math.abs(v)), amount_value: v, merchant: mer, transaction_type: '支払い', status: 'confirmed', source: 'paypay_csv', raw: '' });
vm.runInContext('S.settings.subIgnore=[]; S.overlay={edits:{},added:[],deleted:[]}; S.base=' + JSON.stringify([
  SBX('s1', '2026/08/07', 'Spotify', -580), SBX('s2', '2026/09/07', 'Spotify', -580), SBX('s3', '2026/10/07', 'Spotify', -580),
  SBX('n1', '2026/08/09', 'Netflix', -1490), SBX('n2', '2026/09/09', 'Netflix', -1490), SBX('n3', '2026/10/09', 'Netflix', -1490),
  SBX('c1', '2026/10/02', 'マクドナルド', -500),
]), ctx);
let sbs = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(sbs.s3.category === 'サブスク' && sbs.s1.category === 'サブスク' && sbs.n3.category === 'サブスク', 'サブスク: 毎月同じ日に引き落とされている支払いは、カテゴリー「サブスク」になる');
ok(sbs.c1.category === '食費', 'サブスク: ふつうの支払いは、これまでのカテゴリーのまま');
ok(get('CAT_NAMES').includes('サブスク'), 'サブスク: カテゴリーの選択肢に「サブスク」がある');
vm.runInContext('S.overlay.edits={n3:{category:"娯楽"}}', ctx);
sbs = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(sbs.n3.category === '娯楽' && sbs.n2.category === 'サブスク', 'サブスク: 自分で選んだカテゴリーは、そのまま(その1件だけ)');
vm.runInContext('S.overlay.edits={}; S.settings.subIgnore=["spotify"]; S.settings.subGone=[]', ctx);
sbs = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(sbs.s3.category === 'サブスク', 'サブスク: 「除外」しても、カテゴリーは「サブスク」のまま');
ok(!get('subLists(all()).subs').some(x => x.key === 'spotify') && get('subLists(all()).hidden').some(x => x.key === 'spotify'), 'サブスク: 「除外」すると、一覧からは外れて、「除外したもの」に入る');
vm.runInContext('S.settings.subGone=["spotify"]; S.settings.subIgnore=[]', ctx);
sbs = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(sbs.s3.category !== 'サブスク' && sbs.s1.category !== 'サブスク', 'サブスク: 「完全に消す」と、カテゴリーも元に戻る');
ok(![...get('subLists(all()).subs'), ...get('subLists(all()).hidden'), ...get('subLists(all()).ended')].some(x => x.key === 'spotify'), 'サブスク: 完全に消したものは、一覧にも「除外したもの」にも出ない');
// 履歴でカテゴリーを「サブスク」にすると、同じ名前は全部サブスク(一覧にも出る)
vm.runInContext('S.settings.subGone=["spotify"]; S.settings.subIgnore=[]; S.learned={}; S.base=' + JSON.stringify([SBX('x1', '2026/10/03', 'ジム会費', -7000), SBX('x2', '2026/05/20', 'ジム会費', -7000), SBX('x3', '2026/10/04', 'スーパー', -900)]), ctx);
get('learnCat')('ジム会費', 'サブスク', -7000);
sbs = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(sbs.x1.category === 'サブスク' && sbs.x2.category === 'サブスク' && sbs.x3.category !== 'サブスク', 'サブスク: 履歴でカテゴリーを「サブスク」にすると、同じ名前の取引が全部サブスクになる');
ok(get('subLists(all()).subs.concat(subLists(all()).ended)').some(x => x.key === 'ジム会費'.normalize('NFKC').toLowerCase() && x.manual !== undefined) || get('subLists(all()).subs.concat(subLists(all()).ended)').some(x => /ジム/.test(x.merchant)), 'サブスク: 自動で見つからない支払いも、「登録」として、サブスクの一覧に出る');
vm.runInContext('S.settings.subGone=["ジム会費"]', ctx);
get('learnCat')('ジム会費', 'サブスク', -7000);
ok(!get('S.settings.subGone').includes('ジム会費'), 'サブスク: 一度消したものでも、もう一度カテゴリーを「サブスク」にすると復活する');
vm.runInContext('S.settings.subIgnore=[]; S.sel={on:true,ids:[]}; S.hist={filter:"all",q:"",upto:null}', ctx);
const hvv = get('viewHistory(all())');
ok(hvv.includes('class="selcount"') && hvv.indexOf('selcount') < hvv.indexOf('data-act="sel-toggle">完了</button><button data-act="sel-all"') && hvv.includes('0件選択中'), '選択バー: 「N件選択中」が上の段、下の段の一番左に「完了」、その右に「すべて選択」がある');
ok(!/<\/button><span>\d+件選択中<\/span><button/.test(hvv), '選択バー: ボタンの間にあった「N件選択中」は、なくなった');
vm.runInContext('S.sel={on:false,ids:[]}', ctx);
// 複数の支払いと相殺・相殺する額・超えた分はお小遣い
const MX = (id, day, mer, v, type = '支払い') => ({ id, date: day + ' 12:00:00', amount: String(Math.abs(v)), amount_value: v, merchant: mer, transaction_type: type, status: 'confirmed', source: 'paypay_csv', raw: '' });
vm.runInContext('S.settings.subGone=[]; S.settings.subIgnore=[]; S.learned={}; S.settings.allowKw=["ヤマダ","山田花子","山田太郎","090******00"]; S.settings.p2pIn=true; S.overlay={edits:{},added:[],deleted:[]}; S.base=' + JSON.stringify([
  MX('p1', '2026/09/01', 'カフェ', -300), MX('p2', '2026/09/01', 'ラーメン', -700), MX('p3', '2026/09/01', '映画', -1000),
  MX('r1', '2026/09/05', 'ゆい', 100, '受け取った金額'),
]), ctx);
ok(JSON.stringify(get('splitByRatio([{value:-300},{value:-700}],100)').map(x => x.amt)) === '[30,70]', '相殺: 300円と700円に100円なら、30円と70円に分かれる');
ok(JSON.stringify(get('splitByRatio([{value:-300},{value:-700}],1000)').map(x => x.amt)) === '[300,700]' && JSON.stringify(get('splitByRatio([{value:-300},{value:-700}],5000)').map(x => x.amt)) === '[300,700]', '相殺: 支払いの合計を超える額は、合計までになる');
vm.runInContext('S.settings.offsets={r1:["p1","p2"]}; S.settings.offAmt={}', ctx);
let mm = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(JSON.stringify(mm.r1.offList.map(x => x.amt)) === '[30,70]' && mm.r1.advance === 100 && mm.r1.allowance === 0, '複数選択: 額を入れなければ、受け取った100円が、30円と70円に分かれる');
vm.runInContext('S.settings.offAmt={r1:60}', ctx);
mm = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(JSON.stringify(mm.r1.offList.map(x => x.amt)) === '[18,42]' && mm.r1.advance === 60 && mm.r1.allowance === 40 && mm.r1.incAmt === 40, '複数選択: 相殺する額を60円と入れたら、18円と42円に分かれ、残り40円はお小遣いになる');
vm.runInContext('S.base.push(' + JSON.stringify(MX('r2', '2026/09/06', 'さえき', 2500, '受け取った金額')) + '); S.settings.offsets={r2:["p3"]}; S.settings.offAmt={}', ctx);
mm = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(mm.r2.offAmt === 1000 && mm.r2.allowance === 1500 && mm.r2.category === '立替金' && mm.r2.incAmt === 1500, '超えた分: 1,000円の支払いと相殺して2,500円もらったら、1,000円を相殺し、超えた1,500円はお小遣いになる');
ok(get('exp(all())') === 2000 - get('all().reduce((a,t)=>a+offOf(t),0)') && get('all().reduce((a,t)=>a+offOf(t),0)') >= 1000, '超えた分: 支出は、相殺した分だけ減る(2,000円 → ' + get('exp(all())') + '円)');
ok(get('dayParts(all().filter(t=>t.day==="2026-09-06"))').e === 0 && get('dayParts(all().filter(t=>t.day==="2026-09-06"))').back === 1000, '相殺: 戻った日の画面には、支出がマイナスにならず、「相殺で戻った分」として出る');
ok(get('inc(all().filter(t=>t.day>="2026-09-05"))') === mm.r1.incAmt + 1500, '超えた分: 収入に入るのは、お小遣いの分だけ');
vm.runInContext('S.settings.offsets={r2:["p1","p2"]}; S.settings.offAmt={r2:300}', ctx);
mm = Object.fromEntries(get('all()').map(t => [t.id, t]));
const byCatx = get('spendByCat(all().filter(t=>t.day==="2026-09-01"))');
ok(mm.r2.offAmt === 300 && JSON.stringify(mm.r2.offList.map(x => x.amt)) === '[90,210]', '相殺する額を入れた場合は、その額が、金額の比で分かれる(300円 → 90円と210円)');
vm.runInContext('S.settings.offsets={}; S.settings.offAmt={r2:300}', ctx);
mm = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(mm.r2.advance === 300 && mm.r2.allowance === 2200, '支払いを選ばずに額だけ入れると、その額が立替金、残りがお小遣いになる');
// 立替金・お小遣い以外の入金(返金など)に、複数の支払いと額を指定
vm.runInContext('S.base.push(' + JSON.stringify(MX('rf', '2026/09/08', '払い戻し', 5000, '返金')) + '); S.settings.offsets={rf:["p3"]}; S.settings.offAmt={}', ctx);
mm = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(mm.rf.offAmt === 1000 && mm.rf.incAmt === 4000, '返金など: 支払い(1,000円)より多い分は、収入として残る');
// お小遣いの人(初期値の4人)と、それ以外
vm.runInContext('S.settings.allowKw=["ヤマダ","山田花子","山田太郎","090******00"]; S.settings.offsets={}; S.settings.offAmt={}; S.settings.alloc={}; S.learned={}; S.overlay={edits:{},added:[],deleted:[]}; S.base=' + JSON.stringify([
  { id: 'a1', date: '2026/10/01 10:00:00', amount: '5,000', amount_value: 5000, merchant: 'ヤマダ　タロウ', transaction_type: '振替入金', status: 'confirmed', source: 'ufj_csv', raw: '摘要:振込ＩＢ１ / 内容:ヤマダ　タロウ' },
  { id: 'a2', date: '2026/10/02 10:00:00', amount: '3,000', amount_value: 3000, merchant: '山田花子', transaction_type: '受け取った金額', status: 'confirmed', source: 'paypay_csv', raw: '' },
  { id: 'a3', date: '2026/10/03 10:00:00', amount: '2,000', amount_value: 2000, merchant: '山田太郎', transaction_type: '受け取った金額', status: 'confirmed', source: 'paypay_csv', raw: '' },
  { id: 'a4', date: '2026/10/04 10:00:00', amount: '1,000', amount_value: 1000, merchant: '090******00', transaction_type: '受け取った金額', status: 'confirmed', source: 'paypay_csv', raw: '' },
  { id: 'a5', date: '2026/10/05 10:00:00', amount: '1,000', amount_value: 1000, merchant: 'たにぐちゆい', transaction_type: '受け取った金額', status: 'confirmed', source: 'paypay_csv', raw: '' },
]), ctx);
const al = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(['a1', 'a2', 'a3', 'a4'].every(k => al[k].category === 'お小遣い' && al[k].incAmt === al[k].value && al[k].allowSender), 'お小遣いの人: ヤマダタロウ・山田花子・山田太郎・090******00 からは、お小遣いになる');
ok(al.a5.category === '立替金' && al.a5.incAmt === 0 && !al.a5.allowSender, 'お小遣いの人以外(たにぐちゆい)からは、お小遣いにならず、立替金になる(相殺側に入る)');
ok(get('allowKws()').length === 4, 'お小遣いの人: 設定した4人が、そのまま使われる');
vm.runInContext('S.settings.allowKw=undefined', ctx);
ok(get('allowKws()').length === 0, '新しく使う人: お小遣いの人の初期値は、空(個人の名前が入っていない)');
// カテゴリーを変える範囲
vm.runInContext('S.learned={}; S.overlay={edits:{},added:[],deleted:[]}; S.base=' + JSON.stringify([
  { id: 'k1', date: '2026/10/01 10:00:00', amount: '500', amount_value: -500, merchant: '謎の店', transaction_type: '支払い', status: 'confirmed', source: 'paypay_csv', raw: '' },
  { id: 'k2', date: '2026/10/08 10:00:00', amount: '700', amount_value: -700, merchant: '謎の店', transaction_type: '支払い', status: 'confirmed', source: 'paypay_csv', raw: '' },
]), ctx);
vm.runInContext("saveTx('k1',{value:-500,merchant:'謎の店',day:'2026-10-01',category:'娯楽',scope:'one'})", ctx);
let kk = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(kk.k1.category === '娯楽' && kk.k2.category !== '娯楽' && Object.keys(get('S.learned')).length === 0, 'カテゴリーの範囲「この取引だけ」: その1件だけが変わり、同じ店名の他の取引は変わらない(覚えない)');
vm.runInContext("saveTx('k1',{value:-500,merchant:'謎の店',day:'2026-10-01',category:'日用品',scope:'all'})", ctx);
kk = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(kk.k1.category === '日用品' && kk.k2.category === '日用品', 'カテゴリーの範囲「同じ店名すべて」: 同じ店名の取引が、全部変わる');
vm.runInContext("S.learned={}; S.overlay={edits:{},added:[],deleted:[]}; bulkApply(['k1'], ()=>({status:'confirmed',category:'旅行'}), '{n}件', false)", ctx);
kk = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(kk.k1.category === '旅行' && kk.k2.category !== '旅行', 'まとめて変更でも「選んだ取引だけ」なら、他の取引は変わらない');
// 速報(メール)と公式CSVの二重の取り除き: 新しいメールを、前の日の同じ金額と取り違えない
const DM = (id, day, mer, v, src) => ({ id, date: day + ' 08:35:00', amount: String(Math.abs(v)), amount_value: v, merchant: mer, transaction_type: '振替支払い', status: 'confirmed', source: src, raw: '' });
vm.runInContext('S.settings.p2pIn=true; S.learned={}; S.overlay={edits:{},added:[],deleted:[]}; S.base=' + JSON.stringify([
  DM('c15', '2026/10/15', 'スイカ　ケイタイ', -1000, 'ufj_csv'), DM('c16', '2026/10/16', 'スイカ　ケイタイ', -1000, 'ufj_csv'), DM('c18', '2026/10/18', 'アツプルドツ', -1600, 'ufj_csv'),
  DM('m19', '2026/10/19', 'スイカ ケイタイケツサイ', -1000, 'ufj_mail'),                 // CSVの最後の日(10/18)より新しい → 消さない
  DM('m16', '2026/10/16', 'スイカ ケイタイケツサイ', -1000, 'ufj_mail'),                 // 10/16のCSVと同じ取引 → 消す
  DM('m18', '2026/10/18', 'アツプルドツトコム', -1600, 'ufj_mail'),                       // 同じ取引(10/18) → 消す
  DM('mx', '2026/10/17', 'アマゾン', -1000, 'ufj_mail'),                                // 金額は同じだが、店名が違う → 消さない
]), ctx);
const dd = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(!!dd.m19, '二重の取り除き: CSVの最後の日(10/18)より新しいメール(10/19)は、前の日の同じ金額とは対応させず、残る');
ok(!dd.m16 && !dd.m18, '二重の取り除き: CSVに同じ取引(金額・店名・日付)があるメールは、取り除かれる');
ok(!!dd.mx, '二重の取り除き: 金額が同じでも、店名が違えば、同じ取引とは見なさない');
// サブスク: 店名 + 近い金額だけ(同じ店の買い物は、巻き込まない)
const AM = (id, day, mer, v, src = 'paypay_csv') => ({ id, date: day + ' 12:00:00', amount: String(Math.abs(v)), amount_value: v, merchant: mer, transaction_type: '支払い', status: 'confirmed', source: src, raw: '' });
vm.runInContext('S.learned={}; S.settings.subDefs=[]; S.settings.subGone=[]; S.settings.subIgnore=[]; S.overlay={edits:{},added:[],deleted:[]}; S.base=' + JSON.stringify([
  AM('z1', '2025/12/16', 'アマゾン', -2950), AM('z2', '2026/01/16', 'アマゾン', -2950), AM('z3', '2026/10/13', 'アマゾン', -9132), AM('z4', '2026/05/03', 'アマゾン', -420),
  AM('f1', '2026/08/05', 'カイガイデヒ', -3600), AM('f2', '2026/09/05', 'カイガイデヒ', -3720), AM('f3', '2026/10/05', 'カイガイデヒ', -3410), AM('f4', '2026/10/06', 'カイガイデヒ', -3900), AM('f5', '2026/10/20', 'カイガイデヒ', -37200),
]), ctx);
vm.runInContext("saveTx('z1',{value:-2950,merchant:'アマゾン',day:'2025-12-16',category:'サブスク',scope:'all'})", ctx);
let ss = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(ss.z1.category === 'サブスク' && ss.z2.category === 'サブスク', 'サブスク登録: アマゾン2,950円をサブスクにすると、同じ金額のアマゾンもサブスクになる');
ok(ss.z3.category !== 'サブスク' && ss.z4.category !== 'サブスク', 'サブスク登録: 同じ店名でも、金額が違う買い物(9,132円・420円)は、サブスクにならない');
vm.runInContext("saveTx('f1',{value:-3600,merchant:'カイガイデヒ',day:'2026-08-05',category:'サブスク',scope:'all'})", ctx);
ss = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(ss.f1.category === 'サブスク' && ss.f2.category === 'サブスク' && ss.f3.category === 'サブスク', 'サブスク登録(為替): カイガイデヒ3,600円を登録すると、3,720円・3,410円(±10%)も、サブスクになる');
ok(ss.f5.category !== 'サブスク', 'サブスク登録(為替): 金額が大きく違う(37,200円)ものは、サブスクにならない');
ok(ss.f3.category === 'サブスク' && ss.f4.category !== 'サブスク', 'サブスク登録: 同じ月に近い金額が2件あれば、3,600円にいちばん近い1件(3,410円)だけがサブスクになる');
vm.runInContext("saveTx('z3',{value:-9132,merchant:'アマゾン',day:'2026-10-13',category:'娯楽',scope:'all'})", ctx);
ss = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(ss.z2.category !== 'サブスク' && !get('S.settings.subDefs').some(d => d.key === 'アマゾン'), 'サブスク登録: 同じ店名を別のカテゴリー(全部)にすると、サブスク登録は外れる');
// 「この取引だけ」なら、その1件だけ
vm.runInContext('S.learned={}; S.settings.subDefs=[]', ctx);
vm.runInContext("saveTx('f1',{value:-3600,merchant:'カイガイデヒ',day:'2026-08-05',category:'サブスク',scope:'one'})", ctx);
ss = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(ss.f1.category === 'サブスク' && ss.f2.category !== 'サブスク', 'サブスク登録: 「この取引だけ」なら、その1件だけがサブスクになる');
// メールとCSVで店名が違っても、同じ店として扱う
vm.runInContext('S.learned={}; S.settings.subDefs=[]; S.base=' + JSON.stringify([
  AM('u1', '2026/09/18', 'フイツトプレイ', -3278, 'ufj_csv'), AM('u2', '2026/10/18', 'フイツトプレイス', -2000, 'ufj_mail'), AM('u3', '2026/10/17', 'アマゾン', -500, 'ufj_mail'), AM('u4', '2026/10/16', 'アマゾンプライム', -500, 'ufj_csv'),
]), ctx);
vm.runInContext("saveTx('u1',{value:-3278,merchant:'フイツトプレイ',day:'2026-09-18',category:'娯楽',scope:'all'})", ctx);
ss = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(ss.u2.category === '娯楽', '店名: CSVの「フイツトプレイ」で覚えたカテゴリーが、メールの「フイツトプレイス」にも使われる');
ok(get("mkey('フイツトプレイス')") === get("mkey('フイツトプレイ')") && get("mkey('アマゾン')") !== get("mkey('アマゾンプライム')"), '店名: 短く切れたCSVの店名とメールの店名は同じ店。ただし、アマゾンとアマゾンプライムは別の店のまま');
// サブスク登録は「店名 + 毎月の同じ頃の日付」
vm.runInContext('S.learned={}; S.settings.subDefs=[]; S.settings.subGone=[]; S.overlay={edits:{},added:[],deleted:[]}; S.base=' + JSON.stringify([
  AM('d1', '2026/07/05', 'カイガイデヒ', -3600), AM('d2', '2026/08/06', 'カイガイデヒ', -4600), AM('d3', '2026/09/20', 'カイガイデヒ', -3600), AM('d4', '2026/09/04', 'カイガイデヒ', -3500), AM('d5', '2026/10/05', 'カイガイデヒ', -12000), AM('d6', '2026/11/02', 'カイガイデヒ', -3600),
]), ctx);
vm.runInContext("saveTx('d1',{value:-3600,merchant:'カイガイデヒ',day:'2026-07-05',category:'サブスク',scope:'all'})", ctx);
ss = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(ss.d2.category === 'サブスク', '日付で登録: 毎月の同じ頃(6日)なら、為替で金額が+28%変わっても、サブスクになる');
ok(ss.d3.category !== 'サブスク', '日付で登録: 金額が同じでも、毎月の同じ頃ではない日(20日)は、サブスクにならない');
ok(ss.d4.category === 'サブスク' && ss.d5.category !== 'サブスク', '日付で登録: 日付が合っても、金額が大きく違う(12,000円)ものは、サブスクにならない');
ok(ss.d6.category === 'サブスク', '日付で登録: 毎月の同じ頃(2日は、5日の±3日以内)なら、サブスクになる');
ok(get('S.settings.subDefs')[0].dom === 5, '日付で登録: 登録には、毎月の日付(5日)が残る');
// サブスクの周期(毎月・毎年)
vm.runInContext('S.learned={}; S.settings.subDefs=[]; S.settings.subCyc={}; S.settings.subGone=[]; S.settings.subIgnore=[]; S.overlay={edits:{},added:[],deleted:[]}; S.base=' + JSON.stringify([
  AM('y1', '2024/10/18', 'GoodNotes', -1350), AM('y2', '2025/10/18', 'GoodNotes', -1480), AM('y3', '2026/10/17', 'GoodNotes', -1600), AM('y4', '2026/03/18', 'GoodNotes', -1500), AM('y5', '2026/10/18', 'GoodNotes', -9000),
]), ctx);
vm.runInContext("saveTx('y2',{value:-1480,merchant:'GoodNotes',day:'2025-10-18',category:'サブスク',scope:'all',cycle:'yearly'})", ctx);
ss = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(get('S.settings.subDefs')[0].cycle === 'yearly' && get('S.settings.subDefs')[0].mon === 10, '周期: 「毎年」で登録すると、周期と月日(10月18日)が記録される');
ok(ss.y1.category === 'サブスク' && ss.y3.category === 'サブスク', '周期(毎年): 毎年10月の同じ頃(±5日)の取引が、サブスクになる(10/17も含む)');
ok(ss.y4.category !== 'サブスク', '周期(毎年): 同じ金額帯でも、別の月(3月)の取引は、サブスクにならない');
ok(ss.y5.category !== 'サブスク', '周期(毎年): 日付が合っても、金額が大きく違う(9,000円)ものは、サブスクにならない');
const yl = get('subLists(all())'), yAll = [...yl.subs, ...yl.ended];
const ye = yAll.find(x => /GoodNotes/.test(x.merchant));
ok(ye && ye.cycle === 'yearly' && ye.next === '2027-10-17', '周期(毎年): サブスクの一覧には「毎年」で出て、次回は1年後(2027-10-17)になる(' + (ye && ye.next) + ')');
vm.runInContext("S.settings.subDefs=[]; S.settings.subCyc={}; saveTx('y2',{value:-1480,merchant:'GoodNotes',day:'2025-10-18',category:'サブスク',scope:'one',cycle:'yearly'})", ctx);
ok(get("S.settings.subCyc['goodnotes']") === 'yearly' && get('S.settings.subDefs.length') === 0, '周期: 「この取引だけ」でも、周期(毎年)は覚える(店名での登録は作らない)');
ok(get('viewSubs(all())').includes('登録・毎年'), '周期: サブスクの一覧に、「登録・毎年10月…日」と出る');
// サブスクの項目: 登録したもの・自分で選んだ1件ずつが、別の項目になる(別々に消せる)
vm.runInContext('S.learned={}; S.settings.subDefs=[]; S.settings.subCyc={}; S.settings.subGone=[]; S.settings.subIgnore=[]; S.overlay={edits:{q2:{category:"サブスク"},q3:{category:"サブスク"}},added:[],deleted:[]}; S.base=' + JSON.stringify([
  AM('q1', '2025/12/16', 'アマゾン', -2950), AM('q2', '2026/10/13', 'アマゾン', -2403), AM('q3', '2026/10/13', 'アマゾン', -9132), AM('q4', '2026/05/09', 'アマゾン', -1500),
]), ctx);
vm.runInContext("saveTx('q1',{value:-2950,merchant:'アマゾン',day:'2025-12-16',category:'サブスク',scope:'all',cycle:'yearly'})", ctx);
let ql = get('subLists(all())'), qa = [...ql.subs, ...ql.ended, ...ql.hidden].filter(x => /アマゾン/.test(x.merchant));
ok(qa.length === 3 && new Set(qa.map(x => x.key)).size === 3, '項目: 登録した2,950円と、自分で選んだ2,403円・9,132円は、別々の項目として出る(' + qa.map(x => x.amount).join('/') + ')');
ok(qa.some(x => x.amount === 2950 && x.cycle === 'yearly'), '項目: 登録した項目は、金額2,950円・毎年で出る');
const k2 = qa.find(x => x.amount === 2403).key;
vm.runInContext("S.settings.subGone=['" + k2 + "']", ctx);
ss = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(ss.q2.category !== 'サブスク' && ss.q3.category === 'サブスク' && ss.q1.category === 'サブスク', '項目: 2,403円の項目だけを「完全に消す」と、その1件だけが元のカテゴリーに戻る(他は残る)');
const dk = qa.find(x => x.amount === 2950).key;
vm.runInContext("S.settings.subGone=['" + dk + "']", ctx);
ss = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(ss.q1.category !== 'サブスク', '項目: 登録した2,950円の項目を「完全に消す」と、その取引が元のカテゴリーに戻る');
// OCR: 店名の選び方(実際に起きた読み取りの例)
const OCR = (id, raw, v, src = 'paypay_ocr') => ({ id, date: '2026年10月22日00時01分', amount: Math.abs(v).toLocaleString() + '円', amount_value: v, merchant: '', transaction_type: '支払い', status: 'confirmed', source: src, raw });
const pm = r => get('pickMerchant')(r);
ok(pm('0:02/ 997/ Cafeレストラン/ ガスト/ ガスト/ ガスト上大岡店/ 2026年10月22日00時01分/ 2,413円の/') === 'ガスト', 'OCR店名: 「997」(電池の数字)や、カテゴリー(Cafeレストラン)ではなく、「ガスト」を選ぶ');
ok(pm('0:04/ •ll 5G/ </ 背面タップ/ トリプルタップが検出されました/ たにぐちゆいさんから受け取る/ 2026年10月22日00時04分/ +1,000円/') === 'たにぐちゆいさんから受け取る', 'OCR店名: 「•ll 5G」ではなく、「〇〇さんから受け取る」を店名にする');
ok(pm('2:31/ •ll 4G (/ ライフ/ 2026年10月22日02時31分/ 171円の/') === 'ライフ', 'OCR店名: 「•ll 4G (」(電波と電池)は、店名にしない');
ok(pm('0:01/ a1l 5G/ いなせ寿司/ 弘明寺店/ 2026年10月18日18時36分/ 4,741円の/') === 'いなせ寿司', 'OCR店名: 「a1l 5G」は、店名にしない。支店名(弘明寺店)の前の「いなせ寿司」を選ぶ');
ok(pm('18:45/ • 4G O/ いなせ寿司/ 弘明寺店/ 2026年10月18日18時36分/') === 'いなせ寿司' && pm('9:41/ マクドナルドモバイルオーダー/ 2026年10月18日09時41分/') === 'マクドナルドモバイルオーダー', 'OCR店名: これまでの読み取りも、そのまま選べる');
ok(['•ll 4G (', '•ll 5G', 'a1l 5G', 'ull LTE', '• 4G O', '997', '99%'].every(x => get('ocrNoise')(x)) && !get('ocrNoise')('ガスト') && !get('ocrNoise')('Cafeレストラン'), 'OCR店名: 電波・電池・数字だけの行は、ノイズと見なし、店名は見なさない');
vm.runInContext('S.learned={}; S.settings.subDefs=[]; S.overlay={edits:{},added:[],deleted:[]}; S.base=' + JSON.stringify([
  { ...OCR('o1', '0:02/ 997/ Cafeレストラン/ ガスト/ ガスト/ ガスト上大岡店/ 2026年10月22日00時01分/ 2,413円の/', -2413), merchant: '997' },
  { ...OCR('o2', '0:01/ a1l 5G/ Cafeレストラン/ ガスト/ ガスト/ ガスト上大岡店/ 2026年10月22日00時01分/ 2,413円の/', -2413), merchant: 'a1l 5G' },
  { ...OCR('o3', '2:31/ •ll 4G (/ ライフ/ 2026年10月22日02時31分/ 171円の/', -171), merchant: '•ll 4G (', date: '2026年10月22日02時31分' },
  { ...OCR('o4', '0:09/ ガスト/ 2026年10月23日00時09分/ 800円の/', -800), merchant: 'ユーザー編集の店名', date: '2026年10月23日00時09分' },
]), ctx);
const oo = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(oo.o3.merchant === 'ライフ' && (oo.o1 || oo.o2).merchant === 'ガスト', 'OCR店名: すでに入っている「997」「a1l 5G」「•ll 4G (」の取引も、アプリで開くと、正しい店名に直る');
ok(!!oo.o1 !== !!oo.o2, 'OCR二重: 同じ画面を2回取り込んだ(日時・金額が同じ)ときは、1件だけが残る');
ok(oo.o4.merchant === 'ユーザー編集の店名', 'OCR店名: 自分で直した店名は、そのまま(直されない)');
vm.runInContext('S.base=' + JSON.stringify([{ ...OCR('r9', '0:04/ •ll 5G/ たにぐちゆいさんから受け取る/ 2026年10月22日00時04分/ +1,000円/ 受け取り完了/', 1000), merchant: '•ll 5G', status: 'needs_review', transaction_type: '受け取った金額', date: '2026年10月22日00時04分' }]), ctx);
const rv = get('all()')[0];
ok(rv.merchant === 'たにぐちゆいさんから受け取る' && !rv.review, 'OCR: 「受け取り完了」の画面は、店名が分かり、要確認にならない');
// 店名が「P1」「A1」のような短い名前でも、ノイズにしない。CSVの行(JSON)の店名が崩れていたものは、取引先から直す
ok(!get('ocrNoise')('P1') && !get('ocrNoise')('A1') && !get('ocrNoise')('7-ELEVEN'), 'OCR店名: 「P1」「A1」のような短い店名は、ノイズにしない');
vm.runInContext('S.base=' + JSON.stringify([{ id: 'paypay_csv_zz', date: '2026/08/16 23:09:00', amount: '699', amount_value: -699, merchant: '{"取引日": "2026', transaction_type: '支払い', status: 'confirmed', source: 'paypay_csv', raw: JSON.stringify({ '取引日': '2026/08/16 23:09:00', '取引先': 'ＬＩＮＥ　ＥＣ', '取引方法': 'PayPay残高' }) }]), ctx);
ok(get('all()')[0].merchant === 'ＬＩＮＥ　ＥＣ', 'CSV行: 店名が「{"取引日": "2026」のように崩れていた取引は、元の行の「取引先」(ＬＩＮＥ　ＥＣ)に直る');
// ===== 汎用: クレジットカード・ほかの銀行/デビットカード =====
const toBuf2 = (text, enc = 'utf8') => { const b = Buffer.from('\ufeff' + text, enc); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const rakuten = '利用日,利用店名・商品名,利用者,支払方法,利用金額,支払手数料,支払総額,10月支払金額,11月繰越残高,新規サイン\n2026/10/05,セブン-イレブン 横浜店,本人,1回払い,"1,234",0,"1,234","1,234",0,\n2026/10/07,Amazon.co.jp,本人,1回払い,"3,980",0,"3,980","3,980",0,\n2026/10/09,Amazon.co.jp,本人,1回払い,-3980,0,-3980,-3980,0,\n2026/10/09,コメダ珈琲,本人,1回払い,780,0,780,780,0,\n2026/10/09,コメダ珈琲,本人,1回払い,780,0,780,780,0,\n合計,,,,"2,794",,,,,\n';
const gg1 = get('parseCsvFile')(toBuf2(rakuten));
ok(gg1.generic && gg1.kind === 'card' && gg1.list.length === 5, '汎用CSV: 楽天カード風のCSV(見出しあり)を、カードの明細として読む(合計の行は除く: ' + (gg1.list && gg1.list.length) + '行)');
ok(gg1.list[0].value === -1234 && gg1.list[0].date === '2026/10/05' && gg1.list[2].value === 3980 && gg1.list[2].type === '返金', '汎用CSV: 支払いはマイナス(-1,234円)、マイナスの金額(取消・返金)はプラスの返金として読む');
const grr = get('makeGenericRecords')(gg1, '楽天カード');
ok(grr.every(r => r.source === 'card_csv:楽天カード') && new Set(grr.map(r => r.id)).size === 5, '汎用CSV: 同じ内容の行(コメダ2件)も、別のIDで残す。取り込み元は「card_csv:楽天カード」');
ok(get("srcLabel('card_csv:楽天カード')") === '楽天カード' && get("srcLabel('bank_csv:楽天銀行')") === '楽天銀行', '汎用CSV: 履歴には、付けた名前(楽天カード)が出る');
const grr2 = get('makeGenericRecords')(get('parseCsvFile')(toBuf2(rakuten)), '楽天カード');
ok(JSON.stringify(grr.map(r => r.id)) === JSON.stringify(grr2.map(r => r.id)), '汎用CSV: 同じファイルをもう一度読んでも、同じIDになる(二重に取り込まない)');
// Shift-JISのCSV
const sjis = '日付,摘要,出金金額,入金金額,残高\n2026/10/01,給料,,"180,000","250,000"\n2026/10/02,カード会社 ニコス,"54,800",,"195,200"\n2026/10/03,ＡＴＭ,"10,000",,"185,200"\n2026/10/04,利息,,5,"185,205"\n';
let sjb;
try { const iconv = await import('iconv-lite'); sjb = iconv.default.encode(sjis, 'shift_jis'); } catch (e) { sjb = null; }
if (sjb) {
  const gg2 = get('parseCsvFile')(sjb.buffer.slice(sjb.byteOffset, sjb.byteOffset + sjb.byteLength));
  ok(gg2.generic && gg2.kind === 'bank' && gg2.list.length === 4 && gg2.list[0].value === 180000 && gg2.list[1].value === -54800, '汎用CSV: Shift-JISの銀行のCSV(出金・入金の列)を、銀行口座として読む');
}
const gg3 = get('parseCsvFile')(toBuf2(sjis));
ok(gg3.generic && gg3.kind === 'bank' && gg3.list.length === 4 && gg3.list[0].value === 180000 && gg3.list[1].value === -54800 && gg3.list[3].value === 5, '汎用CSV: 出金・入金の列があれば銀行口座として読む(入金はプラス、出金はマイナス)');
ok(get('parseCsvFile')(toBuf2('これは,関係の,ないCSV\n1,2,3\n')).error, '汎用CSV: 日付と金額の列がないCSVは、エラーにする');
// 取り込みの流れ(名前を聞く → 取り込み)
vm.runInContext("window.__askGeneric = (f, g, guess) => '楽天カード'; S.learned={}; S.settings.subDefs=[]; S.settings.offsets={}; S.settings.cardPayExclude=false; S.overlay={edits:{},added:[],deleted:[]}; S.base=[]", ctx);
const fls = [{ name: 'rakuten_202610.csv', arrayBuffer: async () => toBuf2(rakuten) }, { name: 'bank.csv', arrayBuffer: async () => toBuf2(sjis) }];
vm.runInContext('window.__ask2 = 0; window.__askGeneric = (f, g, guess) => (f === "bank.csv" ? "楽天銀行" : "楽天カード")', ctx);
ctx.__fl = fls;
await vm.runInContext('importCsvFiles(__fl)', ctx);
const ccs = get('all()');
ok(ccs.filter(t => t.source === 'card_csv:楽天カード').length === 5 && ccs.filter(t => t.source === 'bank_csv:楽天銀行').length === 4, '汎用CSV: カードと銀行の2つを同時に取り込める');
ok(ccs.find(t => t.merchant === 'コメダ珈琲').category === '食費' && ccs.find(t => /セブン/.test(t.merchant)).category === '食費', '汎用CSV: 店名から、カテゴリーが自動で付く');
const amz = ccs.filter(t => t.merchant === 'Amazon.co.jp');
ok(amz.some(t => t.value === 3980 && t.offsetOf) && inc_ok(), '汎用CSV: カードの取消(+3,980円)は、同じ店・同じ金額の支払いと自動で相殺され、収入にならない');
function inc_ok() { return !ccs.some(t => t.source === 'card_csv:楽天カード' && t.value > 0 && !t.offsetOf); }
const bnk = Object.fromEntries(ccs.filter(t => t.source === 'bank_csv:楽天銀行').map(t => [t.merchant, t]));
ok(bnk['給料'].group === 'main' && bnk['給料'].category === '収入' && bnk['利息'].group === 'nonincome', '汎用CSV(銀行): 入金は、「給料」などの言葉があるものだけが収入。利息は、収入以外');
ok(bnk['カード会社 ニコス'].group === 'main' && bnk['カード会社 ニコス'].value === -54800, '汎用CSV(銀行): カード代金の引き落としは、設定がオフのうちは、支出に数える');
vm.runInContext('S.settings.cardPayExclude = true', ctx);
const ccs2 = Object.fromEntries(get('all()').filter(t => t.source === 'bank_csv:楽天銀行').map(t => [t.merchant, t]));
ok(ccs2['カード会社 ニコス'].group === 'transfer', '汎用CSV(銀行): 「引き落としを収支から除く」をオンにすると、カード代金の引き落としは「振替」になる');
ok(get('viewSync(all())').includes('クレジットカードの引き落とし') && get('viewSync(all())').includes('楽天カード'), '設定: 「クレジットカードの引き落とし」の項目があり、取り込み済みのカード名が出る');
// 速報(メール)とカードのCSVの二重
vm.runInContext('S.settings.cardPayExclude=false; S.overlay={edits:{},added:[],deleted:[]}; S.base=' + JSON.stringify([
  { id: 'cm1', date: '2026/10/05 12:30:00', amount: '1,234', amount_value: -1234, merchant: 'セブン-イレブン 横浜店', transaction_type: 'カード支払い', status: 'confirmed', source: 'card_mail:楽天カード', raw: '' },
  { id: 'cm2', date: '2026/10/20 09:00:00', amount: '500', amount_value: -500, merchant: 'ドトール', transaction_type: 'カード支払い', status: 'confirmed', source: 'card_mail:楽天カード', raw: '' },
  { id: 'cc1', date: '2026/10/05', amount: '1,234', amount_value: -1234, merchant: 'セブン-イレブン 横浜店', transaction_type: 'カード支払い', status: 'confirmed', source: 'card_csv:楽天カード', raw: '' },
  { id: 'ccs2', date: '2026/10/12', amount: '800', amount_value: -800, merchant: 'ガスト', transaction_type: 'カード支払い', status: 'confirmed', source: 'card_csv:楽天カード', raw: '' },
]), ctx);
const dmm = Object.fromEntries(get('all()').map(t => [t.id, t]));
ok(!dmm.cm1 && !!dmm.cm2 && !!dmm.cc1, 'カードの二重: メールと、あとから来たCSVが同じ取引なら、メールの方を消す。CSVにまだない新しいメール(10/20)は残す');
{
  const b = Buffer.from('k/qVdCyTRZd2LI9vi+CL4Ip6LJP8i+CL4Ip6LI5jjYIKMjAyNi8xMC8wMSyLi5e/LCwiMTgwLDAwMCIsIjI1MCwwMDAiCjIwMjYvMTAvMDIsg0qBW4Noie+O0CCDaoNSg1gsIjU0LDgwMCIsLCIxOTUsMjAwIgo=', 'base64'), gj = get('parseCsvFile')(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  ok(gj.generic && gj.kind === 'bank' && gj.list.length === 2 && gj.list[1].merchant === 'カード会社 ニコス' && gj.list[1].value === -54800, '汎用CSV: Shift-JIS(Windowsで保存した銀行のCSV)も読める');
}
vm.runInContext('S.base=' + JSON.stringify([
  { ...OCR('s1', '0:23/ さえきりこさんから受け取る/ 2026年10月24日00時23分/ +2,050円/ 受け取り完了/', 2050), merchant: 'さえきりこさんから受け取る', transaction_type: '受け取った金額', status: 'confirmed', date: '2026年10月24日00時23分' },
  { ...OCR('s2', '0:24/ 片山雄太さんから受け取る/ 2026年10月24日00時23分/ +2,050円/ 受け取り完了/', 2050), merchant: '片山雄太さんから受け取る', transaction_type: '受け取った金額', status: 'confirmed', date: '2026年10月24日00時23分' },
]), ctx);
ok(get('all()').length === 2, 'OCR二重: 同じ時刻に、別の人から同じ額を受け取ったときは、2件とも残る');

// ===== よくある店の辞書 =====
const catCases = [['はま寿司 上大岡店','食費'],['セイコーマート','食費'],['ロピア 川崎','食費'],['ココス','食費'],['一蘭 渋谷','食費'],['成城石井','食費'],['ミスタードーナツ','食費'],['7-ELEVEN','食費'],['小田急電鉄','交通'],['ジェットスター','交通'],['しまむら','日用品'],['ヨドバシカメラ','日用品'],['ラウンドワン','娯楽'],['ビッグエコー','娯楽'],['アパホテル','旅行'],['東京ガス','住居'],['ＮＨＫ受信料','住居'],['ヤマト運輸','その他']];
ok(catCases.every(([m, c]) => get('autoCat(' + JSON.stringify({ merchant: m, raw: '' }) + ')') === c), '店の辞書: よくあるチェーン店は、自動で、食費・交通・日用品・娯楽・旅行・住居・その他に分かれる');
ok(get('autoCat(' + JSON.stringify({ merchant: '山田商店', raw: '' }) + ')') === null && get('autoCat(' + JSON.stringify({ merchant: 'ABC', raw: '' }) + ')') === null, '店の辞書: 知らない店は、決めつけない(要確認になる)');

// ===== Workerの版の確認 =====
vm.runInContext("S.cloud={url:'https://w.example',key:'k'}; workerLatest=3; cloudInfo={version:2,backend:'d1',d1:true,rows:5};", ctx);
ok(get('workerOutdated()') === true, '版: Workerが最新より古いときは、「更新があります」と判定する');
vm.runInContext("cloudInfo={backend:'d1',d1:true,rows:5};", ctx);
ok(get('workerOutdated()') === true, '版: 版の数字が返ってこない古いWorkerも、古いと判定する');
vm.runInContext("cloudInfo={version:3,backend:'d1',d1:true,rows:5};", ctx);
ok(get('workerOutdated()') === false && /最新です/.test(get('cloudInfoText()')), '版: 最新のときは、案内を出さない');
vm.runInContext("cloudInfo={error:'x'};", ctx);
ok(get('workerOutdated()') === false, '版: 確認できないときは、案内を出さない');
vm.runInContext("S.cloud=null; cloudInfo=null; workerLatest=null;", ctx);

// ===== 安全(画面に出す文字の無害化) =====
const EVIL = '<img src=x onerror=alert(1)>"\'><script>alert(2)</script>';
vm.runInContext('S.learned={}; S.overlay={edits:{},added:[],deleted:[]}; S.base=' + JSON.stringify([
  { ...OCR('x1', '0:01/ ' + EVIL + '/ 2026年10月24日00時01分/ 100円の/ 支払い完了', -100), merchant: EVIL, date: '2026年10月24日00時01分' },
  { id: 'x"2<b>', date: '2026/10/24 10:00:00', amount: '5', amount_value: -5, merchant: EVIL, transaction_type: '支払い', status: 'confirmed', source: 'card_mail:' + EVIL, raw: EVIL },
]) + '; S.cur={y:2026,m:10}', ctx);
vm.runInContext("S.cloud={url:'https://w.example',key:'k'}", ctx);
const views = [get('viewHistory(all())'), get("viewCal(all())"), get("viewDay(all(),'2026-10-24')"), get("viewStats(all(),'month')"), get('viewSync(all())')];
vm.runInContext('S.cloud=null', ctx);
ok(views.every(h => !/<img src=x|<script>alert/.test(h)), '安全: 悪意のある店名・差出人・IDが入っていても、履歴・カレンダー・日別・レポートに、そのままの<タグ>は出ない');
ok(views[0].includes('&lt;img'), '安全: 危ない文字は、無害な文字に変えて表示される');

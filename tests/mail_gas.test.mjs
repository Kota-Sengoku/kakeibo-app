// Apps Script の環境を、まねして動かすテスト(Gmail・通信・プロパティ・自動実行を、偽物に置き換える)
import fs from 'fs';
import vm from 'vm';
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) process.exitCode = 1; };
const read = () => fs.readFileSync(new URL('../src/mail.gs', import.meta.url), 'utf8');

function makeEnv({ messages = [], respond = () => 200, triggers = [] } = {}) {
  const store = new Map(), posts = [], mails = [];
  const PROP_MAX = 9 * 1024;      // 本物の Apps Script: 1つの値は約9KBまで
  const props = {
    getProperty: (k) => (store.has(k) ? store.get(k) : null),
    setProperty: (k, v) => { if (Buffer.byteLength(String(v), 'utf8') > PROP_MAX) throw new Error('Exception: 引数が大きすぎます: value'); store.set(k, String(v)); },
  };
  const msg = (m) => ({ getId: () => m.id, getFrom: () => m.from || 'mail@jcbdebit.bk.mufg.jp', getSubject: () => m.subject || 'ご利用のお知らせ', getPlainBody: () => m.body || '【ご利用日時(日本時間)】2026年11月09日 12:00 【ご利用金額】100 円 【ご利用先】テスト' });
  const trig = triggers.map((h) => ({ getHandlerFunction: () => h }));
  const ctx = {
    console, JSON, Date, Math, String, Number, Array, Object, Error, RegExp, parseInt, Buffer,
    PropertiesService: { getScriptProperties: () => props },
    GmailApp: { search: (q, s, n) => messages.slice(s || 0, (s || 0) + (n || 500)).map((m) => ({ getMessages: () => [msg(m)] })) },
    UrlFetchApp: { fetch: (url, opt) => { posts.push({ url, opt }); const code = respond(url, opt, posts.length); return { getResponseCode: () => code, getContentText: () => JSON.stringify(code === 200 ? { ok: true, status: 'added', added: 1, skipped: 0 } : { error: 'x' }) }; } },
    ScriptApp: { getProjectTriggers: () => trig.slice(), deleteTrigger: (t) => { trig.splice(trig.indexOf(t), 1); }, newTrigger: (h) => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => trig.push({ getHandlerFunction: () => h }) }) }) }) },
    MailApp: { sendEmail: (...a) => mails.push(a) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'me@example.com' }) },
    Logger: { log() {} },
  };
  vm.createContext(ctx);
  return { ctx, store, posts, mails, trig };
}
const ids = (n, p = '') => Array.from({ length: n }, (_, i) => ({ id: p + (0x18c0000000000000n + BigInt(i)).toString(16) }));
const mailSrc = read().replace('__WORKER_URL__', 'https://w.example').replace('__APP_KEY__', 'k');

// 2) メール取り込み: 2,000通を取り込んでも、保存の上限(約9KB)で、エラーにならない
let e2 = makeEnv({ messages: ids(2000) });
vm.runInContext(mailSrc, e2.ctx);
let err2 = null; try { vm.runInContext('kakeiboBackfill()', e2.ctx); } catch (e) { err2 = e.message; }
const saved = JSON.parse(e2.store.get('KAKEIBO_MAIL_DONE') || '[]');
ok(!err2 && saved.length > 300 && Buffer.byteLength(e2.store.get('KAKEIBO_MAIL_DONE')) < 9 * 1024, `メール取り込み: 2,000通でも、保存の上限を超えない(保存 ${saved.length}件・${Buffer.byteLength(e2.store.get('KAKEIBO_MAIL_DONE') || '')}バイト) ${err2 || ''}`);
// Gmailの検索は、新しいメールから順に返す(偽物では、先頭が いちばん新しい)
ok(saved.includes(ids(2000)[0].id) && !saved.includes(ids(2000)[1999].id), 'メール取り込み: 上限に達したときは、新しいほうのメールを、取り込み済みとして残す(古いほうから捨てる)');
const before = e2.posts.length; vm.runInContext('kakeiboRun()', e2.ctx);
ok(e2.posts.length - before <= 2000 - saved.length, '2回目は、取り込み済みのメールを、送り直さない');

// 3) 中継役が混んでいる(429)・不調(500)のときは、エラーにしない(次の10分でやり直す)
for (const code of [429, 500, 503]) {
  const e3 = makeEnv({ messages: ids(5), respond: (u, o, n) => (n >= 3 ? code : 200) });
  vm.runInContext(mailSrc, e3.ctx);
  let err3 = null; try { vm.runInContext('kakeiboRun()', e3.ctx); } catch (e) { err3 = e.message; }
  const s3 = JSON.parse(e3.store.get('KAKEIBO_MAIL_DONE') || '[]');
  ok(!err3 && e3.mails.length === 0 && s3.length === 2, `メール取り込み: 中継役が ${code} のときは、エラーにせず、送れた2通だけを記録する`);
}
// 4) 合言葉の間違い(401)は、分かる文で知らせる
const e4 = makeEnv({ messages: ids(3), respond: () => 401 });
vm.runInContext(mailSrc, e4.ctx);
let err4 = null; try { vm.runInContext('kakeiboRun()', e4.ctx); } catch (e) { err4 = e.message; }
ok(err4 && /合言葉/.test(err4) && e4.mails.length === 1, 'メール取り込み: 合言葉が違うときは、「合言葉が違います」と、メールで知らせる');
// 5) 古い版の自動実行(run)が残っていたら、片付ける。UFJの run があるときは、残す
const e5 = makeEnv({ triggers: ['run', 'run'] });
vm.runInContext(mailSrc, e5.ctx); vm.runInContext('kakeiboSetup()', e5.ctx);
ok(e5.trig.map((t) => t.getHandlerFunction()).join(',') === 'kakeiboRun', '設定: 古い版の「run」の自動実行は消して、「kakeiboRun」だけにする');
// 名前が、ほかのスクリプトとぶつからない(すべて kakeibo / KAKEIBO_ で始まる)
const names = [...mailSrc.matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
ok(names.length > 0 && names.every((n) => /^(kakeibo|KAKEIBO_)/.test(n)), 'Apps Script: 全体の名前は、すべて kakeibo / KAKEIBO_ で始まる(同じプロジェクトの、ほかのスクリプトとぶつからない) ' + names.filter((n) => !/^(kakeibo|KAKEIBO_)/.test(n)).join(','));

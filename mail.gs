/**
 * 家計簿アプリ: Gmail の「ご利用のお知らせ」メール → 自動で取り込む(Google Apps Script)
 *
 * アプリの 設定 →「メールの自動取り込み」で「スクリプトをコピー」を押すと、
 * 下の2行(KAKEIBO_WORKER_URL / KAKEIBO_APP_KEY)が、あなたの値になった状態でコピーされます。
 *
 * 使い方(最初の1回だけ):
 *   1. https://script.google.com で「新しいプロジェクト」を作り、中身を全部消して、このコードを貼り付ける
 *   2. 上の関数の選択欄で「kakeiboSetup」を選んで、▶ 実行する
 *   3. 「承認が必要です」と出たら、許可する(「このアプリは確認されていません」→「詳細」→「(安全ではないページ)に移動」)
 *   4. これで、10分ごとに、新しいメールを取り込みます。過去90日分は、「kakeiboBackfill」を実行すると取り込めます
 *
 * メールの読み取り(日時・金額・利用先)は、家計簿の中継役(Worker)がします。
 * このスクリプトは、メールを送るだけなので、カードの追加や読み取りの改善で、書き換える必要はありません。
 *
 * ほかのスクリプト(UFJの取り込み・バックアップなど)と、同じプロジェクトに入れても、ぶつからないように、
 * 名前はすべて「kakeibo」「KAKEIBO_」で始めています。
 */

const KAKEIBO_WORKER_URL = '__WORKER_URL__';
const KAKEIBO_APP_KEY = '__APP_KEY__';

// 取り込む差出人(メールアドレスの一部)。使っているカード会社が足りなければ、ここに足してください。
const KAKEIBO_SENDERS = [
  'jcbdebit.bk.mufg.jp',                 // 三菱UFJ-JCBデビット
  'vpass.ne.jp', 'smbc-card.com',        // 三井住友カード
  'rakuten-card.co.jp',                  // 楽天カード
  'jcb.co.jp',                           // JCB
  'paypay-card.co.jp',                   // PayPayカード
  'aeon.co.jp', 'saisoncard.co.jp', 'epos.co.jp', 'viewsnet.jp', 'dccard.co.jp', 'orico.co.jp',
  'amex.co.jp', 'americanexpress.com', 'diners.co.jp', 'mufg-nicos.co.jp', 'cr.mufg.jp',
  'sony-bank.co.jp', 'rakuten-bank.co.jp',
  'paypay-bank.co.jp', 'gmo-aozora.com', 'smbc.co.jp', 'netbk.co.jp', 'mizuhobank.co.jp', 'resonabank.co.jp',   // Visaデビットを出している銀行
];
const KAKEIBO_LOOKBACK = 'newer_than:3d';     // 直近3日分を見る(取り込み済みのメールは、自動で飛ばす)
const KAKEIBO_DONE_KEY = 'KAKEIBO_MAIL_DONE';  // 取り込み済みのメールの一覧を、保存する場所の名前
const KAKEIBO_DONE_MAX_CHARS = 8000;           // Apps Script のプロパティは、1つ約9KBまで。余裕をもって、8,000文字に収める

/** 最初の1回だけ実行: 10分ごとの自動実行を設定して、すぐに1回、取り込む */
function kakeiboSetup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const h = t.getHandlerFunction();
    // 古い版(関数名が run だったころ)の自動実行が残っていると、「関数が見つかりません」が10分ごとに出るので、消す。
    // ただし、同じプロジェクトに、別の run(UFJの取り込みなど)があるときは、そちらのものなので、残す。
    if (h === 'kakeiboRun' || (h === 'run' && typeof run === 'undefined')) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kakeiboRun').timeBased().everyMinutes(10).create();
  kakeiboRun();
  Logger.log('設定できました。10分ごとに、新しいメールを取り込みます。');
}

/** 10分ごとに動く入口。失敗したら、自分宛てのメールで知らせる(6時間に1通まで) */
function kakeiboRun() {
  try {
    kakeiboImport_(KAKEIBO_LOOKBACK);
  } catch (e) {
    kakeiboNotify_(e);
    throw e;
  }
}

/** 過去90日分を取り込む(何度実行しても、二重にはなりません) */
function kakeiboBackfill() {
  kakeiboImport_('newer_than:90d');
}

function kakeiboQuery_(lookback) {
  return '(' + KAKEIBO_SENDERS.map(function (s) { return 'from:' + s; }).join(' OR ') + ') ' + lookback;
}

/** 取り込み済みの一覧を、新しいものから、上限の大きさに収まるだけ保存する */
function kakeiboSaveDone_(props, ids) {
  const keep = [];
  let size = 2;
  for (let i = ids.length - 1; i >= 0; i--) {
    size += String(ids[i]).length + 3;
    if (size > KAKEIBO_DONE_MAX_CHARS) break;
    keep.unshift(ids[i]);
  }
  props.setProperty(KAKEIBO_DONE_KEY, JSON.stringify(keep));
}

function kakeiboImport_(lookback) {
  const props = PropertiesService.getScriptProperties();
  let done = [];
  try { done = JSON.parse(props.getProperty(KAKEIBO_DONE_KEY) || '[]'); } catch (e) { done = []; }
  const doneSet = {};
  done.forEach(function (id) { doneSet[id] = true; });

  const ids = [];
  let stop = null;
  // Gmailの検索は、1回に100スレッドまで。過去分(kakeiboBackfill)でも、全部見るように、100ずつ続きを読む(最大1,000スレッド)
  let threads = [];
  for (let start = 0; start < 1000; start += 100) {
    const page = GmailApp.search(kakeiboQuery_(lookback), start, 100);
    threads = threads.concat(page);
    if (page.length < 100) break;
  }
  for (let t = 0; t < threads.length && !stop; t++) {
    const msgs = threads[t].getMessages();
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i], id = m.getId();
      if (doneSet[id]) continue;
      const res = UrlFetchApp.fetch(KAKEIBO_WORKER_URL.replace(/\/+$/, '') + '/api/mail', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'X-App-Key': KAKEIBO_APP_KEY },
        payload: JSON.stringify({ id: id, from: m.getFrom(), subject: m.getSubject(), body: m.getPlainBody().slice(0, 20000) }),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code === 200) { ids.push(id); doneSet[id] = true; continue; }   // 読めないメールも、取り込み済みとして記録する(同じメールを何度も送らない)
      if (code === 401) { stop = new Error('合言葉(鍵)が違います。アプリの 設定 →「メールの自動取り込み」→「スクリプトをコピー」で、貼り直してください'); break; }
      if (code === 429 || code >= 500) { stop = 'retry'; break; }          // 混んでいる・一時的な不調: 次の10分でやり直す(エラーにはしない)
      stop = new Error('中継役エラー ' + code + ': ' + String(res.getContentText()).slice(0, 200)); break;
    }
  }
  // 途中で止まっても、ここまでに送れた分は、取り込み済みとして残す
  // Gmailは新しいメールから順に返すので、逆にして、新しいものが一覧の後ろ(残す側)に来るようにする
  if (ids.length) kakeiboSaveDone_(props, done.concat(ids.slice().reverse()));
  if (stop && stop !== 'retry') throw stop;
}

/** 動作確認用: 最新の1通を、取り込みはせずに、中継役に送って、どう読まれるかを「実行ログ」に出す */
function kakeiboTest() {
  const threads = GmailApp.search(kakeiboQuery_('newer_than:60d'), 0, 1);
  if (!threads.length) { Logger.log('対象のメールが見つかりません。KAKEIBO_SENDERS を確認してください'); return; }
  const m = threads[0].getMessages().slice(-1)[0];
  Logger.log('件名: ' + m.getSubject() + ' / 差出人: ' + m.getFrom());
  const res = UrlFetchApp.fetch(KAKEIBO_WORKER_URL.replace(/\/+$/, '') + '/api/mail', {
    method: 'post', contentType: 'application/json', headers: { 'X-App-Key': KAKEIBO_APP_KEY },
    payload: JSON.stringify({ dry: true, id: 'test_' + m.getId(), from: m.getFrom(), subject: m.getSubject(), body: m.getPlainBody().slice(0, 20000) }),
    muteHttpExceptions: true,
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}

function kakeiboNotify_(e) {
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('KAKEIBO_LAST_ERROR_MAIL') || 0);
  if (Date.now() - last < 6 * 60 * 60 * 1000) return;
  props.setProperty('KAKEIBO_LAST_ERROR_MAIL', String(Date.now()));
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '【家計簿】メールの取り込みでエラーが起きました',
    String(e && e.message ? e.message : e) + '\n\nApps Script の「実行数」から、詳しいログを確認できます。');
}

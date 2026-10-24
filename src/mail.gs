/**
 * 家計簿アプリ: Gmail の「ご利用のお知らせ」メール → 自動で取り込む(Google Apps Script)
 *
 * アプリの 設定 →「メールの自動取り込み」で「スクリプトをコピー」を押すと、
 * 下の2行(WORKER_URL / APP_KEY)が、あなたの値になった状態でコピーされます。
 *
 * 使い方(最初の1回だけ):
 *   1. https://script.google.com で「新しいプロジェクト」を作り、中身を全部消して、このコードを貼り付ける
 *   2. 上の関数の選択欄で「setup」を選んで、▶ 実行する
 *   3. 「承認が必要です」と出たら、許可する(「このアプリは確認されていません」→「詳細」→「(安全ではないページ)に移動」)
 *   4. これで、10分ごとに、新しいメールを取り込みます。過去90日分は、「backfill」を実行すると取り込めます
 *
 * メールの読み取り(日時・金額・利用先)は、家計簿の中継役(Worker)がします。
 * このスクリプトは、メールを送るだけなので、カードの追加や読み取りの改善で、書き換える必要はありません。
 */

const WORKER_URL = '__WORKER_URL__';
const APP_KEY = '__APP_KEY__';

// 取り込む差出人(メールアドレスの一部)。使っているカード会社が足りなければ、ここに足してください。
const SENDERS = [
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
const LOOKBACK = 'newer_than:3d';   // 直近3日分を見る(取り込み済みのメールは、自動で飛ばす)

/** 最初の1回だけ実行: 10分ごとの自動実行を設定して、すぐに1回、取り込む */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'run') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('run').timeBased().everyMinutes(10).create();
  run();
  Logger.log('設定できました。10分ごとに、新しいメールを取り込みます。');
}

/** 10分ごとに動く入口。失敗したら、自分宛てのメールで知らせる(6時間に1通まで) */
function run() {
  try {
    importMails_(LOOKBACK);
  } catch (e) {
    notifyError_(e);
    throw e;
  }
}

/** 過去90日分を取り込む(何度実行しても、二重にはなりません) */
function backfill() {
  importMails_('newer_than:90d');
}

function importMails_(lookback) {
  const props = PropertiesService.getScriptProperties();
  const done = JSON.parse(props.getProperty('DONE') || '[]');
  const doneSet = {};
  done.forEach(function (id) { doneSet[id] = true; });
  const query = '(' + SENDERS.map(function (s) { return 'from:' + s; }).join(' OR ') + ') ' + lookback;

  const ids = [];
  GmailApp.search(query, 0, 100).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      const id = m.getId();
      if (doneSet[id]) return;
      const res = UrlFetchApp.fetch(WORKER_URL.replace(/\/+$/, '') + '/api/mail', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'X-App-Key': APP_KEY },
        payload: JSON.stringify({ id: id, from: m.getFrom(), subject: m.getSubject(), body: m.getPlainBody().slice(0, 20000) }),
        muteHttpExceptions: true,
      });
      // 失敗したら「取り込み済み」にしない(次の実行でやり直す)
      if (res.getResponseCode() !== 200) throw new Error('中継役エラー ' + res.getResponseCode() + ': ' + res.getContentText());
      ids.push(id);        // 「読めないメール」も、取り込み済みとして記録する(同じメールを何度も送らない)
    });
  });
  if (ids.length) props.setProperty('DONE', JSON.stringify(done.concat(ids).slice(-1000)));
}

/** 動作確認用: 最新の1通を、取り込みはせずに、中継役に送って、どう読まれるかを「実行ログ」に出す */
function test() {
  const threads = GmailApp.search('(' + SENDERS.map(function (s) { return 'from:' + s; }).join(' OR ') + ') newer_than:60d', 0, 1);
  if (!threads.length) { Logger.log('対象のメールが見つかりません。SENDERS を確認してください'); return; }
  const m = threads[0].getMessages().slice(-1)[0];
  Logger.log('件名: ' + m.getSubject() + ' / 差出人: ' + m.getFrom());
  const res = UrlFetchApp.fetch(WORKER_URL.replace(/\/+$/, '') + '/api/mail', {
    method: 'post', contentType: 'application/json', headers: { 'X-App-Key': APP_KEY },
    payload: JSON.stringify({ dry: true, id: 'test_' + m.getId(), from: m.getFrom(), subject: m.getSubject(), body: m.getPlainBody().slice(0, 20000) }),
    muteHttpExceptions: true,
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}

function notifyError_(e) {
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('LAST_ERROR_MAIL') || 0);
  if (Date.now() - last < 6 * 60 * 60 * 1000) return;
  props.setProperty('LAST_ERROR_MAIL', String(Date.now()));
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '【家計簿】メールの取り込みでエラーが起きました',
    String(e && e.message ? e.message : e) + '\n\nApps Script の「実行数」から、詳しいログを確認できます。');
}

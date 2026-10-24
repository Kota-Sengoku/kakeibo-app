# 家計簿アプリを、自分で直す・育てる(開発の手引き)

このリポジトリは、家計簿アプリの、元のコードと、テスト、公開の道具が入っています。
自分用に直したいときは、フォーク(コピー)して使ってください。

## フォルダの見方

| 場所 | 中身 |
|---|---|
| `src/index.html` | **アプリ本体**(1つのファイル。HTML・CSS・JavaScript)。ほとんどの修正は、ここです |
| `src/worker.js` | データの置き場所(Cloudflare Worker)。保存・読み込み・メールや背面タップの取り込み |
| `src/mail.gs` | Gmail 取り込み用の Apps Script の雛形(アプリが、アドレスと合言葉を入れてコピーする) |
| `src/sw.js`, `manifest.json` | ホーム画面に追加するための部品(通常は、触らなくてOK) |
| `src/release.json` | 公開のお知らせと、Workerの版(下の「公開の仕方」) |
| `tests/` | テスト(`node tests/run-all.mjs` で、全部動く) |
| `tools/release.mjs` | `src/` を、公開用の場所にコピーする道具 |
| 最上位の `index.html` など | **安定版**(GitHub Pagesで公開される場所。直接は、直さない) |
| `beta/` | **ベータ版**(自分だけが先に試す場所) |

## 仕組みの全体

```
iPhone/PC のアプリ(index.html) ←→ Cloudflare Worker(worker.js) ←→ D1データベース
                                         ↑
   iPhone背面タップ(ショートカット) → /api/ingest
   Gmail(Apps Script: mail.gs)    → /api/mail
```

- アプリは、ブラウザの `localStorage` に、データのコピーを持ちます。保存は、Worker経由で D1 に。
- Worker の API: `GET /api/transactions`(差分取得)、`POST /api/apply`(編集・削除・追加)、`POST /api/import`(取り込み)、`GET/POST /api/settings`、`POST /api/ingest`(背面タップ)、`POST /api/mail`(メール)、`GET /api/info`(版と件数)。すべて `X-App-Key` ヘッダの合言葉が必要です。
- 取引は、`tx(id, data=JSONの本体, updated_at, deleted)` の1つの表に入っています。

## 直して、試す手順

1. フォークして、PC にクローンする。Node.js 22.5 以上を入れる。
2. `src/index.html` などを直す。
3. テストを動かす: `node tests/run-all.mjs`(全部「合格」になること)
4. ベータ版に出す: `node tools/release.mjs beta` → `git add -A` → `git commit` → `git push`
   → `https://(あなたの名前).github.io/(リポジトリ名)/beta/` で確認する(ベータ版は、安定版と、データを共有します)
5. 問題がなければ、安定版に出す: `node tools/release.mjs stable` → `git commit` → `git push`

GitHub Pages の設定: リポジトリの Settings → Pages → Branch を `main`、フォルダを `/ (root)` にします。

## 友達に更新を反映する(しない)の選び方

- **アプリ本体**: 安定版(最上位)に出した時点で、友達が次にアプリを開いたとき、自動で最新になります。
  先に自分だけで試したいときは、ベータ版にだけ出してください(友達には、反映されません)。
- **Workerの更新の案内**: 友達のWorkerは、友達自身のCloudflareにあるので、自動では入れ替わりません。
  `src/release.json` で、案内を出すかを選べます。
  - `worker`(最新の版)を、`src/worker.js` の `const VERSION` と同じ数字に上げる → 友達の設定に「更新があります(任意)」と出る
  - `workerMin`(必須の版)も上げる → 「更新が必要です」と出る(古いと動かない変更のときだけ)
  - どちらも上げない → 案内は出ない(アプリだけが新しくなる)
- **お知らせ**: `release.json` の `id` を新しい文字にして、`notes` に書くと、友達の設定の上に、1回だけ「新しくなりました」のお知らせが出ます。

## テストについて

- `tests/*.test.mjs` は、Node の標準の機能だけで動きます(外部のパッケージは不要)。
- アプリのテストは、`index.html` の中のJavaScriptを、ブラウザの代わりの環境(`vm`)で動かします。
- Workerのテストは、D1の代わりに、Node の SQLite(`node:sqlite`)を使います。
- 自分のCSVを使うテストは、含めていません(個人情報のため)。

## お願い

- 合言葉や、Notion のトークンなど、秘密の値は、**コードに書かない**でください(Cloudflareの「Secret」に入れます)。
- 自分で直したものは、自分の環境でお使いください。元のリポジトリに戻したいときは、プルリクエストでお知らせください。

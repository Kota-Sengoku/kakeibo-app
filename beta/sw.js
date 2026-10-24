// アプリ本体(HTML/アイコン)だけをキャッシュ。データ(transactions.json)は端末内に保存されるため対象外。
const CACHE = 'kakeibo-shell-v2';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // ネット優先(ブラウザの一時保存は使わず、毎回、更新を確認する)。オフライン時のみキャッシュ
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});

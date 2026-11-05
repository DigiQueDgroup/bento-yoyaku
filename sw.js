/* 大将軍弁当予約システム Service Worker
   - 画面（index.html など）は「ネット優先」：更新したらすぐ反映され、圏外のときだけ保存済みを表示
   - CDN（Tailwind・フォントなど）は保存して高速表示
   - Supabase（予約データ）は一切キャッシュしない
   ※ 大きく更新したときは CACHE の番号を上げてください */
const CACHE = 'bento-v1';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE)
            .then(function (cache) {
                // 1つ失敗しても全体が失敗しないよう個別に追加
                return Promise.all(SHELL.map(function (u) { return cache.add(u).catch(function () {}); }));
            })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
            })
            .then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (event) {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // 予約データ（Supabase）は常にネットワークへ
    if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

    // ページ本体：ネット優先、失敗したら保存済み
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then(function (res) {
                    const copy = res.clone();
                    caches.open(CACHE).then(function (c) { c.put('index.html', copy); });
                    return res;
                })
                .catch(function () {
                    return caches.match('index.html').then(function (r) { return r || caches.match('./'); });
                })
        );
        return;
    }

    // 自分のファイル・CDN：保存済みを先に返しつつ裏で更新
    if (url.origin === self.location.origin || CDN_HOSTS.indexOf(url.hostname) !== -1) {
        event.respondWith(
            caches.match(req).then(function (cached) {
                const network = fetch(req)
                    .then(function (res) {
                        if (res && (res.ok || res.type === 'opaque')) {
                            const copy = res.clone();
                            caches.open(CACHE).then(function (c) { c.put(req, copy); });
                        }
                        return res;
                    })
                    .catch(function () { return cached; });
                return cached || network;
            })
        );
    }
});

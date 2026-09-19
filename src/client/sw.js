/**
 * Service Worker
 */

import composeNotification from './scripts/compose-notification';

// eslint-disable-next-line no-undef
const version = _VERSION_;
const cacheName = `dp-cache-${version}`;

const apiUrl = `${location.origin}/api/`;

// インストールされたとき
self.addEventListener('install', ev => {
	console.info('installed');

  ev.waitUntil(
		caches.open(cacheName)
			.then(cache => {
				return cache.addAll([
					'/',
					'/assets/app.js',
					'/assets/error.jpg'
				]);
			})
			.then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
	ev.waitUntil(
		caches.keys()
			.then(cacheNames => Promise.all(
				cacheNames
					.filter((v) => v !== cacheName)
					.map(name => caches.delete(name))
			))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', ev => {
	if (ev.request.method !== 'GET' || ev.request.url.startsWith(apiUrl)) return;
	ev.respondWith(
		caches.match(ev.request)
			.then(response => {
				return response || fetch(ev.request);
			})
			.catch(() => {
				return caches.match('/');
			})
	);
});

// プッシュ通知を受け取ったとき
self.addEventListener('push', ev => {
	// クライアント取得
	ev.waitUntil(self.clients.matchAll({
		type: 'window',
		includeUncontrolled: true
	}).then(clients => {
		// 表示されているクライアントがあればアプリ内で通知されるので、OSの通知は出さない
		// (バックグラウンドのタブが開いているだけの場合は通知する)
		if (clients.some(client => client.visibilityState === 'visible')) return;

		const { type, body } = ev.data.json();

		const n = composeNotification(type, body);
		if (n == null) return;

		return self.registration.showNotification(n.title, {
			body: n.body,
			icon: n.icon,
			data: { url: n.url },
		});
	}));
});

// 通知がクリックされたとき
self.addEventListener('notificationclick', ev => {
	ev.notification.close();

	const url = `${location.origin}${(ev.notification.data && ev.notification.data.url) || '/'}`;

	ev.waitUntil(self.clients.matchAll({
		type: 'window',
		includeUncontrolled: true
	}).then(clients => {
		// 既に開いているタブがあればそれをフォーカスする
		for (const client of clients) {
			if (client.url.startsWith(location.origin) && 'focus' in client) {
				return client.focus();
			}
		}

		return self.clients.openWindow(url);
	}));
});

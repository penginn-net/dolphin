/*
 * プッシュ通知に載せる内容を組み立てるロジックのテスト
 *
 * `yarn test` で実行する (DBは不要)。
 */

import * as assert from 'assert';
import * as fs from 'fs';

import composeNotification from '../src/client/scripts/compose-notification';

const user = {
	id: 'user1',
	username: 'alice',
	name: 'Alice',
	avatarUrl: 'https://example.com/avatar.png',
};

const note = {
	id: 'note1',
	text: 'こんにちは',
	userId: 'user1',
	user,
};

// サーバーがpushする通知は Notifications.pack() の結果
const notification = (type: string, extra: any = {}) => ({
	id: 'notification1',
	createdAt: new Date().toISOString(),
	type,
	userId: user.id,
	user,
	...extra,
});

describe('compose-notification', () => {
	it('メンションは投稿の本文を本文にする', () => {
		const n = composeNotification('notification', notification('mention', { note }));

		assert.ok(n);
		assert.strictEqual(n!.title, 'Alice:');
		assert.strictEqual(n!.body, 'こんにちは');
		assert.strictEqual(n!.icon, user.avatarUrl);
		assert.strictEqual(n!.url, '/notes/note1');
	});

	it('返信は投稿の本文を本文にする', () => {
		const n = composeNotification('notification', notification('reply', { note }));

		assert.ok(n);
		assert.ok(n!.title.includes('Alice'));
		assert.strictEqual(n!.body, 'こんにちは');
	});

	it('引用は投稿の本文を本文にする', () => {
		const n = composeNotification('notification', notification('quote', { note }));

		assert.ok(n);
		assert.strictEqual(n!.body, 'こんにちは');
	});

	it('Renoteを通知できる', () => {
		const n = composeNotification('notification', notification('renote', { note }));

		assert.ok(n);
		assert.strictEqual(n!.body, 'こんにちは');
	});

	it('リアクションはリアクションと投稿の本文を載せる', () => {
		const n = composeNotification('notification', notification('reaction', { note, reaction: '👍' }));

		assert.ok(n);
		assert.ok(n!.title.includes('👍'));
		assert.strictEqual(n!.body, 'こんにちは');
	});

	it('投票を通知できる', () => {
		const n = composeNotification('notification', notification('pollVote', { note, choice: 0 }));

		assert.ok(n);
		assert.strictEqual(n!.body, 'こんにちは');
	});

	it('フォローを通知できる', () => {
		const n = composeNotification('notification', notification('follow'));

		assert.ok(n);
		assert.ok(n!.title.includes('Alice'));
		// 投稿を伴わない通知はユーザーページを開く
		assert.strictEqual(n!.url, '/@alice');
	});

	it('フォローリクエストを通知できる', () => {
		const n = composeNotification('notification', notification('receiveFollowRequest'));

		assert.ok(n);
		assert.ok(n!.title.includes('Alice'));
	});

	it('nameが無いユーザーはusernameを使う', () => {
		const n = composeNotification('notification', notification('follow', {
			user: { ...user, name: null },
		}));

		assert.ok(n);
		assert.ok(n!.title.includes('alice'));
	});

	it('ファイルのアップロードを通知できる', () => {
		const n = composeNotification('driveFileCreated', {
			name: 'lenna.jpg',
			url: 'https://example.com/files/lenna.jpg',
		});

		assert.ok(n);
		assert.strictEqual(n!.body, 'lenna.jpg');
	});

	it('知らない種類の通知ではnullを返す', () => {
		// Service Workerはnullを受け取ったら通知を出さない
		assert.strictEqual(composeNotification('notification', notification('unknownType')), null);
		assert.strictEqual(composeNotification('unknownEvent', {}), null);
	});

	it('ユーザーが入っていない通知ではnullを返す', () => {
		assert.strictEqual(composeNotification('notification', { type: 'follow' }), null);
		assert.strictEqual(composeNotification('notification', null), null);
	});
});

describe('service worker', () => {
	// クライアントは /sw.<version>.js を登録し、
	// サーバーはそれを assets/sw.js として返す (src/server/web/index.ts)
	it('ビルド成果物に assets/sw.js がある', function() {
		const assets = `${__dirname}/../built/client/assets`;

		// ビルド前ならスキップ
		if (!fs.existsSync(assets)) this.skip();

		assert.ok(fs.existsSync(`${assets}/sw.js`),
			'assets/sw.js が無いとServiceWorkerが登録できず、プッシュ通知が機能しない');
	});
});

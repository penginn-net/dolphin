/*
 * 保存先ごと、かつローカル/リモートごとのドライブ使用量の集計のテスト
 *
 * 実際のDBに対して集計する。
 * .config/test.yml が無い環境ではスキップされる
 * (用意の仕方は .config/test_example.yml を参照)
 */

import * as assert from 'assert';

import { DAY, createDriveFile, createUser, deleteAllDriveFiles, hasTestConfig, initTestDb } from './utils';

describe('storage stats (DB)', function() {
	this.timeout(60000);

	let calcStorageStats: any = null;

	before(async function() {
		if (!hasTestConfig()) {
			this.skip();
			return;
		}

		await initTestDb();

		calcStorageStats = require('../src/services/drive/storage-stats').calcStorageStats;
	});

	beforeEach(async function() {
		if (calcStorageStats == null) this.skip();

		// 他のテストのファイルが混ざらないようにする
		await deleteAllDriveFiles();
	});

	const local = (props: any = {}) => createDriveFile({ userHost: null, ...props });
	const remote = (props: any = {}) => createDriveFile({ userHost: 'remote.example.com', ...props });

	describe('保存先ごとの集計', () => {
		it('保存先ごとに件数と容量を集計する', async () => {
			await local({ storedInternal: true, size: 100 });
			await local({ storedInternal: false, size: 200 });
			await remote({ storedInternal: false, size: 400 });
			await remote({ storedInternal: false, storedInColdStorage: true, size: 800 });

			const stats = await calcStorageStats();

			assert.deepStrictEqual(stats.internal.total, { count: 1, size: 100 });
			assert.deepStrictEqual(stats.objectStorage.total, { count: 2, size: 600 });
			assert.deepStrictEqual(stats.coldStorage.total, { count: 1, size: 800 });
			assert.deepStrictEqual(stats.total.total, { count: 4, size: 1500 });
		});

		it('保存先ごとにローカルとリモートを分ける', async () => {
			await local({ storedInternal: true, size: 100 });
			await remote({ storedInternal: true, size: 200 });
			await remote({ storedInternal: true, size: 400 });

			const stats = await calcStorageStats();

			assert.deepStrictEqual(stats.internal.local, { count: 1, size: 100 });
			assert.deepStrictEqual(stats.internal.remote, { count: 2, size: 600 });
			assert.deepStrictEqual(stats.internal.total, { count: 3, size: 700 });
		});

		it('ローカルとリモートの合計が全体と一致する', async () => {
			await local({ storedInternal: true, size: 100 });
			await remote({ size: 200 });
			await remote({ storedInColdStorage: true, size: 400 });

			const stats = await calcStorageStats();

			for (const place of ['total', 'internal', 'objectStorage', 'coldStorage', 'link']) {
				const usage = stats[place];
				assert.strictEqual(usage.local.count + usage.remote.count, usage.total.count, place);
				assert.strictEqual(usage.local.size + usage.remote.size, usage.total.size, place);
			}
		});

		it('保存先ごとの合計が全体と一致する', async () => {
			await local({ storedInternal: true, size: 100 });
			await remote({ size: 200 });
			await remote({ storedInColdStorage: true, size: 400 });

			const stats = await calcStorageStats();

			for (const origin of ['local', 'remote', 'total']) {
				assert.strictEqual(
					stats.internal[origin].size + stats.objectStorage[origin].size + stats.coldStorage[origin].size,
					stats.total[origin].size, origin);
				assert.strictEqual(
					stats.internal[origin].count + stats.objectStorage[origin].count + stats.coldStorage[origin].count,
					stats.total[origin].count, origin);
			}
		});

		it('直リンクのファイルは使用量に数えず、別に数える', async () => {
			await local({ size: 100 });
			await remote({ isLink: true, accessKey: null, size: 0 });
			await remote({ isLink: true, accessKey: null, size: 0 });

			const stats = await calcStorageStats();

			assert.deepStrictEqual(stats.total.total, { count: 1, size: 100 });
			assert.strictEqual(stats.link.remote.count, 2);
			assert.strictEqual(stats.link.local.count, 0);
		});

		it('ファイルが無くても0を返す', async () => {
			const stats = await calcStorageStats();

			assert.deepStrictEqual(stats.total.total, { count: 0, size: 0 });
			assert.deepStrictEqual(stats.coldStorage.local, { count: 0, size: 0 });
			assert.deepStrictEqual(stats.link.total, { count: 0, size: 0 });
		});
	});

	describe('退避できるファイル', () => {
		it('退避先が設定されていれば件数と容量を返す', async () => {
			// 古いリモートのファイルは退避対象
			await remote({ size: 100 });
			// 新しいファイルは対象外
			await remote({ createdAt: new Date(Date.now() - (1 * DAY)), size: 200 });
			// 退避済みも対象外
			await remote({ storedInColdStorage: true, size: 400 });
			// ローカルユーザーのファイルも対象外
			await local({ size: 800 });

			const stats = await calcStorageStats();

			assert.strictEqual(stats.migration.available, true);
			assert.strictEqual(stats.migration.olderThanDays, 90);
			assert.deepStrictEqual(stats.migration.migratable, { count: 1, size: 100 });
		});

		it('アイコンに使われているファイルは数えない', async () => {
			const file = await remote({ size: 100 });
			await createUser({ avatarId: file.id });

			const stats = await calcStorageStats();

			assert.deepStrictEqual(stats.migration.migratable, { count: 0, size: 0 });
		});
	});
});

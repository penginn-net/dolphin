/*
 * 保存先ごとのドライブ使用量の集計のテスト
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

	it('保存先ごとに件数と容量を集計する', async () => {
		await createDriveFile({ storedInternal: true, size: 100 });
		await createDriveFile({ storedInternal: false, size: 200 });
		await createDriveFile({ storedInternal: false, size: 400 });
		await createDriveFile({ storedInternal: false, storedInColdStorage: true, size: 800 });

		const stats = await calcStorageStats();

		assert.deepStrictEqual(stats.internal, { count: 1, size: 100 });
		assert.deepStrictEqual(stats.objectStorage, { count: 2, size: 600 });
		assert.deepStrictEqual(stats.coldStorage, { count: 1, size: 800 });
		assert.deepStrictEqual(stats.total, { count: 4, size: 1500 });
	});

	it('内訳の合計が全体と一致する', async () => {
		await createDriveFile({ storedInternal: true, size: 100 });
		await createDriveFile({ storedInternal: false, size: 200 });
		await createDriveFile({ storedInternal: false, storedInColdStorage: true, size: 400 });

		const stats = await calcStorageStats();

		assert.strictEqual(
			stats.internal.size + stats.objectStorage.size + stats.coldStorage.size,
			stats.total.size);
		assert.strictEqual(
			stats.internal.count + stats.objectStorage.count + stats.coldStorage.count,
			stats.total.count);
		assert.strictEqual(stats.local.size + stats.remote.size, stats.total.size);
		assert.strictEqual(stats.local.count + stats.remote.count, stats.total.count);
	});

	it('ローカルとリモートを区別する', async () => {
		await createDriveFile({ userHost: null, size: 100 });
		await createDriveFile({ userHost: 'remote.example.com', size: 200 });
		await createDriveFile({ userHost: 'remote.example.com', size: 400 });

		const stats = await calcStorageStats();

		assert.deepStrictEqual(stats.local, { count: 1, size: 100 });
		assert.deepStrictEqual(stats.remote, { count: 2, size: 600 });
	});

	it('直リンクのファイルは使用量に数えない', async () => {
		await createDriveFile({ size: 100 });
		await createDriveFile({ isLink: true, accessKey: null, size: 0 });
		await createDriveFile({ isLink: true, accessKey: null, size: 0 });

		const stats = await calcStorageStats();

		assert.deepStrictEqual(stats.total, { count: 1, size: 100 });
		assert.strictEqual(stats.linkCount, 2);
	});

	it('ファイルが無くても0を返す', async () => {
		const stats = await calcStorageStats();

		assert.deepStrictEqual(stats.total, { count: 0, size: 0 });
		assert.deepStrictEqual(stats.coldStorage, { count: 0, size: 0 });
		assert.strictEqual(stats.linkCount, 0);
	});

	describe('退避できるファイル', () => {
		it('退避先が設定されていれば件数と容量を返す', async () => {
			// 古いファイルは退避対象
			await createDriveFile({ size: 100 });
			// 新しいファイルは対象外
			await createDriveFile({ createdAt: new Date(Date.now() - (1 * DAY)), size: 200 });
			// 退避済みも対象外
			await createDriveFile({ storedInColdStorage: true, size: 400 });

			const stats = await calcStorageStats();

			assert.strictEqual(stats.migration.available, true);
			assert.strictEqual(stats.migration.olderThanDays, 90);
			assert.deepStrictEqual(stats.migration.migratable, { count: 1, size: 100 });
		});

		it('アイコンに使われているファイルは数えない', async () => {
			const file = await createDriveFile({ size: 100 });
			await createUser({ avatarId: file.id });

			const stats = await calcStorageStats();

			assert.deepStrictEqual(stats.migration.migratable, { count: 0, size: 0 });
		});
	});
});

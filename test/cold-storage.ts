/*
 * 退避先オブジェクトストレージ(コールドストレージ)のテスト
 *
 * `yarn test` で実行する。
 * DBを使うテストは .config/test.yml が無ければスキップされる。
 * 実行するには PostgreSQL を用意した上で、設定ファイルを置く:
 *
 *   cp .config/test_example.yml .config/test.yml
 *
 * 指定したDBのスキーマはテストの度に作り直されるので、
 * 本番のDBを指定しないこと。
 */

import * as assert from 'assert';
import * as fs from 'fs';

import {
	DEFAULT_OLDER_THAN_DAYS,
	buildColdStorageTargetConditions,
	calcColdStorageThreshold,
	detectExt,
	getBaseUrl,
	getKeyPrefix,
	isColdStorageAvailable,
	normalizeContentType
} from '../src/services/drive/cold-storage-util';

const DAY = 24 * 60 * 60 * 1000;

describe('cold storage', () => {
	describe('isColdStorageAvailable', () => {
		it('未設定なら利用不可', () => {
			assert.strictEqual(isColdStorageAvailable(undefined), false);
		});

		it('bucketが無ければ利用不可', () => {
			assert.strictEqual(isColdStorageAvailable({ endpoint: 'example.net' }), false);
			assert.strictEqual(isColdStorageAvailable({ bucket: '' }), false);
		});

		it('bucketがあれば利用可能', () => {
			assert.strictEqual(isColdStorageAvailable({ bucket: 'cold' }), true);
		});
	});

	describe('calcColdStorageThreshold', () => {
		const now = new Date('2020-01-01T00:00:00.000Z');

		it('olderThanDaysの分だけ遡る', () => {
			const threshold = calcColdStorageThreshold({ bucket: 'cold', olderThanDays: 10 }, now);
			assert.strictEqual(threshold.getTime(), now.getTime() - (10 * DAY));
		});

		it('未指定ならデフォルト値を使う', () => {
			const threshold = calcColdStorageThreshold({ bucket: 'cold' }, now);
			assert.strictEqual(threshold.getTime(), now.getTime() - (DEFAULT_OLDER_THAN_DAYS * DAY));
			assert.strictEqual(DEFAULT_OLDER_THAN_DAYS, 90);
		});

		it('0なら遡らない', () => {
			const threshold = calcColdStorageThreshold({ bucket: 'cold', olderThanDays: 0 }, now);
			assert.strictEqual(threshold.getTime(), now.getTime());
		});
	});

	describe('getBaseUrl', () => {
		it('baseUrlがあればそれを使う', () => {
			assert.strictEqual(getBaseUrl({
				bucket: 'cold',
				baseUrl: 'https://cold.example.com',
				endpoint: 's3.example.net',
				useSSL: true
			}), 'https://cold.example.com');
		});

		it('baseUrlが無ければendpointとbucketから組み立てる', () => {
			assert.strictEqual(getBaseUrl({
				bucket: 'cold',
				endpoint: 's3.example.net',
				useSSL: true
			}), 'https://s3.example.net/cold');
		});

		it('useSSLが偽ならhttpになる', () => {
			assert.strictEqual(getBaseUrl({
				bucket: 'cold',
				endpoint: 's3.example.net'
			}), 'http://s3.example.net/cold');
		});

		it('portが指定されていれば付与する', () => {
			assert.strictEqual(getBaseUrl({
				bucket: 'cold',
				endpoint: 's3.example.net',
				port: 9000
			}), 'http://s3.example.net:9000/cold');
		});
	});

	describe('getKeyPrefix', () => {
		it('prefixが無ければ空文字', () => {
			assert.strictEqual(getKeyPrefix({ bucket: 'cold' }), '');
			assert.strictEqual(getKeyPrefix({ bucket: 'cold', prefix: '' }), '');
		});

		it('prefixがあれば区切りのスラッシュを付ける', () => {
			assert.strictEqual(getKeyPrefix({ bucket: 'cold', prefix: 'files' }), 'files/');
		});
	});

	describe('detectExt', () => {
		it('ファイル名の拡張子を優先する', () => {
			assert.strictEqual(detectExt('lenna.jpg', 'image/png'), '.jpg');
			assert.strictEqual(detectExt('archive.tar.gz', 'application/gzip'), '.gz');
		});

		it('拡張子が無ければContent-Typeから決める', () => {
			assert.strictEqual(detectExt('untitled', 'image/jpeg'), '.jpg');
			assert.strictEqual(detectExt('untitled', 'image/png'), '.png');
			assert.strictEqual(detectExt('untitled', 'image/webp'), '.webp');
			assert.strictEqual(detectExt('untitled', 'image/gif'), '.gif');
			assert.strictEqual(detectExt('untitled', 'image/apng'), '.apng');
			assert.strictEqual(detectExt('untitled', 'image/vnd.mozilla.apng'), '.apng');
		});

		it('ファイル名が無くてもContent-Typeから決められる', () => {
			assert.strictEqual(detectExt(null, 'image/jpeg'), '.jpg');
		});

		it('判別できなければ空文字', () => {
			assert.strictEqual(detectExt('untitled', 'application/octet-stream'), '');
			assert.strictEqual(detectExt(null, 'application/octet-stream'), '');
		});

		it('ディレクトリ区切りを拡張子と誤認しない', () => {
			assert.strictEqual(detectExt('a.b/lenna', 'application/octet-stream'), '');
		});
	});

	describe('normalizeContentType', () => {
		it('apngはpngとして扱う', () => {
			assert.strictEqual(normalizeContentType('image/apng'), 'image/png');
		});

		it('それ以外はそのまま', () => {
			assert.strictEqual(normalizeContentType('image/jpeg'), 'image/jpeg');
			assert.strictEqual(normalizeContentType('video/mp4'), 'video/mp4');
		});
	});

	describe('buildColdStorageTargetConditions', () => {
		const threshold = new Date('2020-01-01T00:00:00.000Z');
		const thresholdId = '01DTVYFMJK0000000000000000';
		const conditions = buildColdStorageTargetConditions(threshold, thresholdId);
		const sql = conditions.map(c => c.sql).join(' AND ');

		it('閾値より古いファイルに限定する', () => {
			const condition = conditions.find(c => c.sql.includes('file.createdAt'));
			assert.ok(condition);
			assert.strictEqual(condition!.sql, 'file.createdAt < :threshold');
			assert.strictEqual(condition!.params.threshold, threshold);
		});

		it('リンクファイルと退避済みファイルを除外する', () => {
			assert.ok(sql.includes('file.isLink = FALSE'));
			assert.ok(sql.includes('file.storedInColdStorage = FALSE'));
			assert.ok(sql.includes('file.accessKey IS NOT NULL'));
		});

		it('アイコン・バナーを除外する', () => {
			assert.ok(sql.includes('"user"."avatarId" = file.id'));
			assert.ok(sql.includes('"user"."bannerId" = file.id'));
		});

		it('カスタム絵文字を除外する', () => {
			// fileIdだけでなく、fileIdを持たない古い絵文字のためにURLでも照合する
			assert.ok(sql.includes('"emoji"."fileId" = file.id'));
			assert.ok(sql.includes('"emoji"."url" = file.url'));
		});

		it('最近の投稿に添付されているファイルを除外する', () => {
			const condition = conditions.find(c => c.sql.includes('"note"'));
			assert.ok(condition);
			assert.ok(condition!.sql.includes('file.id = ANY("note"."fileIds")'));
			// IDの範囲で走査対象を絞る
			assert.ok(condition!.sql.includes('"note"."id" > :thresholdId'));
			assert.strictEqual(condition!.params.thresholdId, thresholdId);
		});

		it('すべての条件がNOT EXISTSかファイル自身の条件である', () => {
			for (const condition of conditions) {
				assert.ok(
					condition.sql.startsWith('file.') || condition.sql.startsWith('NOT EXISTS ('),
					`unexpected condition: ${condition.sql}`);
			}
		});
	});
});

/**
 * 実際のDBに対して退避対象の絞り込みを検証する
 * (.config/test.yml が無い環境ではスキップされる)
 */
describe('cold storage target query (DB)', function() {
	this.timeout(60000);

	let ctx: any = null;

	before(async function() {
		if (!fs.existsSync(`${__dirname}/../.config/test.yml`)) {
			this.skip();
			return;
		}

		process.env.NODE_ENV = 'test';

		const { initDb } = require('../src/db/postgre');
		await initDb();

		ctx = {
			models: require('../src/models'),
			genId: require('../src/misc/gen-id').genId,
			createColdStorageTargetQuery: require('../src/services/drive/cold-storage-query').createColdStorageTargetQuery,
		};
	});

	after(async () => {
		if (ctx == null) return;
		const { getConnection } = require('typeorm');
		await getConnection().close();
	});

	const threshold = () => new Date(Date.now() - (90 * DAY));

	const createFile = async (props: any = {}) => {
		const { DriveFiles } = ctx.models;
		const createdAt: Date = props.createdAt || new Date(Date.now() - (365 * DAY));
		const id = ctx.genId(createdAt);

		return await DriveFiles.save({
			id,
			createdAt,
			userId: null,
			userHost: null,
			md5: id.toLowerCase().padEnd(32, '0').slice(0, 32),
			name: 'lenna.jpg',
			type: 'image/jpeg',
			size: 1024,
			comment: null,
			properties: {},
			storedInternal: false,
			storedInColdStorage: false,
			url: `https://example.com/files/${id}.jpg`,
			thumbnailUrl: null,
			accessKey: `files/${id}.jpg`,
			thumbnailAccessKey: null,
			isLink: false,
			isSensitive: false,
			ownedBySystem: false,
			...props,
		});
	};

	const createUser = async (props: any = {}) => {
		const { Users, UserProfiles, UserKeypairs } = ctx.models;
		const id = ctx.genId();

		const user = await Users.save({
			id,
			createdAt: new Date(),
			username: `u${id}`.slice(0, 20),
			usernameLower: `u${id}`.slice(0, 20).toLowerCase(),
			host: null,
			token: id.slice(0, 16),
			isAdmin: false,
			...props,
		});

		await UserProfiles.save({ userId: user.id, autoAcceptFollowed: false });
		await UserKeypairs.save({ userId: user.id, publicKey: 'x', privateKey: 'x' });

		return user;
	};

	const findTargetIds = async () => {
		const files = await ctx.createColdStorageTargetQuery(threshold()).getMany();
		return files.map((f: any) => f.id);
	};

	beforeEach(async function() {
		if (ctx == null) this.skip();
	});

	it('古い添付ファイルは退避対象になる', async () => {
		const file = await createFile();

		assert.ok((await findTargetIds()).includes(file.id));
	});

	it('新しいファイルは退避対象にならない', async () => {
		const file = await createFile({ createdAt: new Date(Date.now() - (1 * DAY)) });

		assert.ok(!(await findTargetIds()).includes(file.id));
	});

	it('退避済みのファイルは退避対象にならない', async () => {
		const file = await createFile({ storedInColdStorage: true });

		assert.ok(!(await findTargetIds()).includes(file.id));
	});

	it('リンクファイルは退避対象にならない', async () => {
		const file = await createFile({ isLink: true, accessKey: null, size: 0 });

		assert.ok(!(await findTargetIds()).includes(file.id));
	});

	it('アイコンに使われているファイルは退避対象にならない', async () => {
		const file = await createFile();
		await createUser({ avatarId: file.id });

		assert.ok(!(await findTargetIds()).includes(file.id));
	});

	it('バナーに使われているファイルは退避対象にならない', async () => {
		const file = await createFile();
		await createUser({ bannerId: file.id });

		assert.ok(!(await findTargetIds()).includes(file.id));
	});

	it('カスタム絵文字に使われているファイルは退避対象にならない', async () => {
		const { Emojis } = ctx.models;
		const file = await createFile();

		await Emojis.save({
			id: ctx.genId(),
			updatedAt: new Date(),
			name: `e${file.id}`.slice(0, 32),
			host: null,
			aliases: [],
			url: file.url,
			type: file.type,
			fileId: file.id,
		});

		assert.ok(!(await findTargetIds()).includes(file.id));
	});

	it('fileIdを持たないカスタム絵文字のファイルも退避対象にならない', async () => {
		const { Emojis } = ctx.models;
		const file = await createFile();

		await Emojis.save({
			id: ctx.genId(),
			updatedAt: new Date(),
			name: `l${file.id}`.slice(0, 32),
			host: null,
			aliases: [],
			url: file.url,
			type: file.type,
			fileId: null,
		});

		assert.ok(!(await findTargetIds()).includes(file.id));
	});

	it('最近の投稿に添付されているファイルは退避対象にならない', async () => {
		const { Notes } = ctx.models;
		const file = await createFile();
		const user = await createUser();
		const createdAt = new Date(Date.now() - (1 * DAY));

		await Notes.save({
			id: ctx.genId(createdAt),
			createdAt,
			userId: user.id,
			userHost: null,
			visibility: 'public',
			fileIds: [file.id],
			text: 'hello',
		});

		assert.ok(!(await findTargetIds()).includes(file.id));
	});

	it('古い投稿にのみ添付されているファイルは退避対象になる', async () => {
		const { Notes } = ctx.models;
		const file = await createFile();
		const user = await createUser();
		const createdAt = new Date(Date.now() - (365 * DAY));

		await Notes.save({
			id: ctx.genId(createdAt),
			createdAt,
			userId: user.id,
			userHost: null,
			visibility: 'public',
			fileIds: [file.id],
			text: 'hello',
		});

		assert.ok((await findTargetIds()).includes(file.id));
	});
});

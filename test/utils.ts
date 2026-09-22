import * as fs from 'fs';

export const async = (fn: Function) => (done: Function) => {
	fn().then(() => {
		done();
	}, (err: Error) => {
		done(err);
	});
};

//#region DBを使うテスト用のヘルパー
//
// .config/test.yml があるときだけDBを使うテストを実行する。
// (用意の仕方は .config/test_example.yml を参照)
//
// 接続はプロセス内で使い回し、明示的には閉じない
// (.mocharc.json の exit:true で終了するため)

export const DAY = 24 * 60 * 60 * 1000;

let models: any = null;
let genIdFn: any = null;

export function hasTestConfig(): boolean {
	return fs.existsSync(`${__dirname}/../.config/test.yml`);
}

/**
 * テスト用DBに接続する (スキーマは毎回作り直される)
 */
export async function initTestDb() {
	if (models != null) return models;

	process.env.NODE_ENV = 'test';

	const { initDb } = require('../src/db/postgre');
	await initDb();

	models = require('../src/models');
	genIdFn = require('../src/misc/gen-id').genId;

	return models;
}

export function genId(date?: Date): string {
	return genIdFn(date);
}

export async function createUser(props: any = {}) {
	const { Users, UserProfiles, UserKeypairs } = models;
	const id = genId();
	const username = `u${id}`.slice(0, 20);

	const user = await Users.save({
		id,
		createdAt: new Date(),
		username,
		usernameLower: username.toLowerCase(),
		host: null,
		token: id.slice(0, 16),
		isAdmin: false,
		...props,
	});

	await UserProfiles.save({ userId: user.id, autoAcceptFollowed: false });
	await UserKeypairs.save({ userId: user.id, publicKey: 'x', privateKey: 'x' });

	return user;
}

export async function createDriveFile(props: any = {}) {
	const { DriveFiles } = models;
	const createdAt: Date = props.createdAt || new Date(Date.now() - (365 * DAY));
	const id = genId(createdAt);

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
}

export async function deleteAllDriveFiles() {
	await models.DriveFiles.createQueryBuilder().delete().execute();
}
//#endregion

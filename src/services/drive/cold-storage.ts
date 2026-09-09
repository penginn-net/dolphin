import * as fileType from 'file-type';
import { v4 as uuid } from 'uuid';
import * as S3 from 'aws-sdk/clients/s3';

import config from '../../config';
import { DriveFile } from '../../models/entities/drive-file';
import { DriveFiles } from '../../models';
import { contentDisposition } from '../../misc/content-disposition';
import { genId } from '../../misc/gen-id';
import { createDeleteObjectStorageFileJob } from '../../queue';
import { InternalStorage } from './internal-storage';
import { driveLogger } from './logger';
import { getBaseUrl, getColdS3, getColdStorageConfig, getS3, isColdStorageConfigured } from './s3';

const logger = driveLogger.createSubLogger('cold-storage', 'cyan');

const DEFAULT_OLDER_THAN_DAYS = 90;

export { isColdStorageConfigured };

/**
 * 退避対象とみなすまでの日数
 */
export function getColdStorageThreshold(): Date {
	const days = getColdStorageConfig().olderThanDays ?? DEFAULT_OLDER_THAN_DAYS;
	return new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
}

/**
 * 退避対象のファイルを絞り込むクエリを作る
 *
 * 以下は退避しない:
 * - リンク(実体を持たない)ファイル
 * - 既に退避済みのファイル
 * - アイコン(アバター)・バナーとして使われているファイル
 * - カスタム絵文字として使われているファイル
 * - 最近の投稿に添付されている(=まだアクセスされうる)ファイル
 */
export function createColdStorageTargetQuery(threshold: Date) {
	// ID は時系列順なので、閾値以降の投稿だけを走査すれば済む
	const thresholdId = genId(threshold);

	return DriveFiles.createQueryBuilder('file')
		.where('file.createdAt < :threshold', { threshold })
		.andWhere('file.isLink = FALSE')
		.andWhere('file.storedInColdStorage = FALSE')
		.andWhere('file.accessKey IS NOT NULL')
		// アイコン・バナーは移動しない
		.andWhere('NOT EXISTS (SELECT 1 FROM "user" WHERE "user"."avatarId" = file.id OR "user"."bannerId" = file.id)')
		// カスタム絵文字は移動しない
		.andWhere('NOT EXISTS (SELECT 1 FROM "emoji" WHERE "emoji"."fileId" = file.id OR "emoji"."url" = file.url)')
		// アクセス頻度が低いとみなせないファイル(最近の投稿の添付)は移動しない
		.andWhere('NOT EXISTS (SELECT 1 FROM "note" WHERE "note"."id" > :thresholdId AND file.id = ANY("note"."fileIds"))', { thresholdId });
}

/**
 * ファイルを退避先(コールドストレージ)に移動する
 */
export async function moveFileToColdStorage(file: DriveFile): Promise<DriveFile> {
	const cold = getColdStorageConfig();

	if (file.isLink) throw new Error('cannot move a link file');
	if (file.storedInColdStorage) return file;
	if (file.accessKey == null) throw new Error('the file has no access key');

	const baseUrl = getBaseUrl(cold);
	const prefix = cold.prefix ? `${cold.prefix}/` : '';

	// 移動元の情報 (DB更新後に消すため控えておく)
	const src = {
		storedInternal: file.storedInternal,
		accessKey: file.accessKey,
		thumbnailAccessKey: file.thumbnailUrl ? file.thumbnailAccessKey : null,
	};

	//#region original
	const key = `${prefix}${uuid()}${detectExt(file.name, file.type)}`;

	logger.info(`moving original to cold storage: ${file.accessKey} -> ${key}`);
	await copyToColdStorage(src.storedInternal, file.accessKey, key, file.type, file.name);
	//#endregion

	//#region thumbnail
	let thumbnailKey: string | null = null;
	let thumbnailUrl: string | null = null;

	if (src.thumbnailAccessKey) {
		const thumbnailType = await detectStoredType(src.storedInternal, src.thumbnailAccessKey, 'image/jpeg');
		thumbnailKey = `${prefix}thumbnail-${uuid()}${detectExt(null, thumbnailType)}`;
		thumbnailUrl = `${baseUrl}/${thumbnailKey}`;

		logger.info(`moving thumbnail to cold storage: ${src.thumbnailAccessKey} -> ${thumbnailKey}`);
		await copyToColdStorage(src.storedInternal, src.thumbnailAccessKey, thumbnailKey, thumbnailType);
	}
	//#endregion

	file.url = `${baseUrl}/${key}`;
	file.thumbnailUrl = thumbnailUrl;
	file.accessKey = key;
	file.thumbnailAccessKey = thumbnailKey;
	file.storedInternal = false;
	file.storedInColdStorage = true;

	await DriveFiles.update(file.id, {
		url: file.url,
		thumbnailUrl: file.thumbnailUrl,
		accessKey: file.accessKey,
		thumbnailAccessKey: file.thumbnailAccessKey,
		storedInternal: file.storedInternal,
		storedInColdStorage: file.storedInColdStorage,
	});

	// 移動元の実体を削除する (DBの更新に成功してから)
	deleteSource(src.storedInternal, src.accessKey);
	if (src.thumbnailAccessKey) deleteSource(src.storedInternal, src.thumbnailAccessKey);

	logger.succ(`drive file has been moved to cold storage ${file.id}`);

	return file;
}

function deleteSource(storedInternal: boolean, key: string) {
	if (storedInternal) {
		InternalStorage.del(key);
	} else {
		createDeleteObjectStorageFileJob(key);
	}
}

/**
 * 現在の保存先から読み出して退避先にアップロードする
 */
async function copyToColdStorage(fromInternal: boolean, srcKey: string, destKey: string, type: string, filename?: string) {
	const cold = getColdStorageConfig();

	const body = fromInternal
		? InternalStorage.read(srcKey)
		: getS3().getObject({
			Bucket: config.drive.bucket!,
			Key: srcKey,
		}).createReadStream();

	const params = {
		Bucket: cold.bucket,
		Key: destKey,
		Body: body,
		ContentType: type === 'image/apng' ? 'image/png' : type,
		CacheControl: 'max-age=31536000, immutable',
	} as S3.PutObjectRequest;

	if (filename) params.ContentDisposition = contentDisposition('inline', filename);

	await getColdS3().upload(params).promise();
}

/**
 * 保存されているオブジェクトのContent-Typeを得る
 */
async function detectStoredType(fromInternal: boolean, key: string, fallback: string): Promise<string> {
	try {
		if (fromInternal) {
			const type = await fileType.fromFile(InternalStorage.resolvePath(key));
			return type ? type.mime : fallback;
		} else {
			const head = await getS3().headObject({
				Bucket: config.drive.bucket!,
				Key: key,
			}).promise();
			return head.ContentType || fallback;
		}
	} catch (e) {
		logger.warn(`cannot detect the type of ${key}: ${e}`);
		return fallback;
	}
}

function detectExt(name: string | null, type: string): string {
	const [ext] = (name?.match(/\.([a-zA-Z0-9_-]+)$/) || ['']);
	if (ext !== '') return ext;

	switch (type) {
		case 'image/jpeg': return '.jpg';
		case 'image/png': return '.png';
		case 'image/webp': return '.webp';
		case 'image/gif': return '.gif';
		case 'image/apng': return '.apng';
		case 'image/vnd.mozilla.apng': return '.apng';
		default: return '';
	}
}

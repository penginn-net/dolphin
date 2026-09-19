import * as fileType from 'file-type';
import { v4 as uuid } from 'uuid';
import * as S3 from 'aws-sdk/clients/s3';

import config from '../../config';
import { DriveFile } from '../../models/entities/drive-file';
import { DriveFiles } from '../../models';
import { contentDisposition } from '../../misc/content-disposition';
import { createDeleteObjectStorageFileJob } from '../../queue';
import { InternalStorage } from './internal-storage';
import { driveLogger } from './logger';
import { getColdS3, getColdStorageConfig, getS3 } from './s3';
import { detectExt, getBaseUrl, getKeyPrefix, normalizeContentType } from './cold-storage-util';

const logger = driveLogger.createSubLogger('cold-storage', 'cyan');

/**
 * ファイルを退避先(コールドストレージ)に移動する
 */
export async function moveFileToColdStorage(file: DriveFile): Promise<DriveFile> {
	const cold = getColdStorageConfig();

	if (file.isLink) throw new Error('cannot move a link file');
	if (file.storedInColdStorage) return file;
	if (file.accessKey == null) throw new Error('the file has no access key');

	const baseUrl = getBaseUrl(cold);
	const prefix = getKeyPrefix(cold);

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
		ContentType: normalizeContentType(type),
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

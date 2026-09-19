import * as S3 from 'aws-sdk/clients/s3';
import config from '../../config';
import { ColdStorage, ObjectStorage } from '../../config/types';
import { getAgentByUrl } from '../../misc/fetch';
import { isColdStorageAvailable } from './cold-storage-util';

function createS3(conf: ObjectStorage) {
	const u = conf.endpoint != null
		? `${conf.useSSL ? 'https://' : 'http://'}${conf.endpoint}`
		: `${conf.useSSL ? 'https://' : 'http://'}example.net`;

	return new S3({
		endpoint: conf.endpoint,
		accessKeyId: conf.accessKey,
		secretAccessKey: conf.secretKey,
		region: conf.region,
		sslEnabled: conf.useSSL,
		s3ForcePathStyle: true,
		httpOptions: {
			agent: getAgentByUrl(new URL(u))
		}
	});
}

export function getS3() {
	return createS3(config.drive);
}

/**
 * 退避先(コールドストレージ)が利用可能なように設定されているか
 */
export function isColdStorageConfigured(): boolean {
	return isColdStorageAvailable(config.drive.coldStorage);
}

export function getColdStorageConfig(): ColdStorage {
	const conf = config.drive.coldStorage;
	if (!isColdStorageAvailable(conf)) throw new Error('cold storage is not configured');
	return conf;
}

export function getColdS3() {
	return createS3(getColdStorageConfig());
}

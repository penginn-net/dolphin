import { DriveFiles } from '../../models';
import { genId } from '../../misc/gen-id';
import { getColdStorageConfig } from './s3';
import { buildColdStorageTargetConditions, calcColdStorageThreshold } from './cold-storage-util';

/**
 * これより古いファイルを退避対象とする日時
 */
export function getColdStorageThreshold(): Date {
	return calcColdStorageThreshold(getColdStorageConfig());
}

/**
 * 退避対象のファイルを絞り込むクエリを作る
 *
 * アイコン・バナー・カスタム絵文字として使われているファイルや、
 * 最近の投稿に添付されているファイルは対象に含まれない
 * (詳細は buildColdStorageTargetConditions を参照)
 */
export function createColdStorageTargetQuery(threshold: Date) {
	const query = DriveFiles.createQueryBuilder('file');

	for (const condition of buildColdStorageTargetConditions(threshold, genId(threshold))) {
		query.andWhere(condition.sql, condition.params);
	}

	return query;
}

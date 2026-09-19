import { ColdStorage, ObjectStorage } from '../../config/types';

/**
 * 退避対象とみなすまでのデフォルトの日数
 */
export const DEFAULT_OLDER_THAN_DAYS = 90;

export type WhereCondition = {
	sql: string;
	params: Record<string, any>;
};

/**
 * 退避先(コールドストレージ)が利用可能なように設定されているか
 */
export function isColdStorageAvailable(conf: ColdStorage | undefined): conf is ColdStorage {
	return conf != null && conf.bucket != null && conf.bucket !== '';
}

/**
 * これより古いファイルを退避対象とする日時
 */
export function calcColdStorageThreshold(conf: ColdStorage, now: Date = new Date()): Date {
	const days = conf.olderThanDays ?? DEFAULT_OLDER_THAN_DAYS;
	return new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
}

/**
 * オブジェクトストレージの公開URLのベースを得る
 */
export function getBaseUrl(conf: ObjectStorage): string {
	return conf.baseUrl
		|| `${ conf.useSSL ? 'https' : 'http' }://${ conf.endpoint }${ conf.port ? `:${conf.port}` : '' }/${ conf.bucket }`;
}

/**
 * オブジェクトキーの先頭に付ける文字列を得る
 */
export function getKeyPrefix(conf: ObjectStorage): string {
	return conf.prefix ? `${conf.prefix}/` : '';
}

/**
 * オブジェクトキーに付ける拡張子を決める
 */
export function detectExt(name: string | null, type: string): string {
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

/**
 * アップロード時に指定するContent-Type
 * (apngはブラウザが解釈できるようpngとして扱う)
 */
export function normalizeContentType(type: string): string {
	return type === 'image/apng' ? 'image/png' : type;
}

/**
 * 退避対象のファイルを絞り込む条件
 *
 * 以下は退避しない:
 * - リンク(実体を持たない)ファイル
 * - 既に退避済みのファイル
 * - アイコン(アバター)・バナーとして使われているファイル
 * - カスタム絵文字として使われているファイル
 * - 最近の投稿に添付されている(=まだアクセスされうる)ファイル
 *
 * @param threshold これより古いファイルを対象とする日時
 * @param thresholdId thresholdに対応するID (IDは時系列順なので、閾値以降の投稿だけを走査すれば済む)
 */
export function buildColdStorageTargetConditions(threshold: Date, thresholdId: string): WhereCondition[] {
	return [
		{ sql: 'file.createdAt < :threshold', params: { threshold } },
		{ sql: 'file.isLink = FALSE', params: {} },
		{ sql: 'file.storedInColdStorage = FALSE', params: {} },
		{ sql: 'file.accessKey IS NOT NULL', params: {} },
		// アイコン・バナーは移動しない
		{ sql: 'NOT EXISTS (SELECT 1 FROM "user" WHERE "user"."avatarId" = file.id OR "user"."bannerId" = file.id)', params: {} },
		// カスタム絵文字は移動しない
		{ sql: 'NOT EXISTS (SELECT 1 FROM "emoji" WHERE "emoji"."fileId" = file.id OR "emoji"."url" = file.url)', params: {} },
		// アクセス頻度が低いとみなせないファイル(最近の投稿の添付)は移動しない
		{ sql: 'NOT EXISTS (SELECT 1 FROM "note" WHERE "note"."id" > :thresholdId AND file.id = ANY("note"."fileIds"))', params: { thresholdId } },
	];
}

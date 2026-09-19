import { DriveFiles } from '../../models';
import { createColdStorageTargetQuery, getColdStorageThreshold } from './cold-storage-query';
import { DEFAULT_OLDER_THAN_DAYS } from './cold-storage-util';
import { isColdStorageConfigured } from './s3';
import config from '../../config';

export type Usage = {
	count: number;
	size: number;
};

export type StorageStats = {
	/** 実体を保持しているファイル全体 */
	total: Usage;
	/** 内部ストレージ(fs)に置かれているもの */
	internal: Usage;
	/** 通常のオブジェクトストレージに置かれているもの */
	objectStorage: Usage;
	/** 退避先(コールドストレージ)に置かれているもの */
	coldStorage: Usage;
	/** ローカルユーザーのもの */
	local: Usage;
	/** リモートユーザーのもの */
	remote: Usage;
	/** 実体を持たない(直リンクの)ファイル数 */
	linkCount: number;
	migration: {
		/** 退避先が設定されているか */
		available: boolean;
		/** 何日より古いファイルを退避対象とするか */
		olderThanDays: number | null;
		/** いま退避できるファイル (退避先が未設定ならnull) */
		migratable: Usage | null;
	};
};

function toNumber(value: any): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

/**
 * 保存先ごとのドライブ使用量を集計する
 *
 * total = internal + objectStorage + coldStorage = local + remote
 * (直リンクのファイルは実体を持たないので linkCount にのみ数える)
 */
export async function calcStorageStats(): Promise<StorageStats> {
	// 保存先ごとの内訳は1クエリで求める
	const usage = (alias: string, condition: string) => [
		[`COUNT(*) FILTER (WHERE ${condition})`, `${alias}Count`] as const,
		[`COALESCE(SUM(file.size) FILTER (WHERE ${condition}), 0)`, `${alias}Size`] as const,
	];

	const stored = 'file.isLink = FALSE';

	const selects = [
		...usage('total', stored),
		...usage('internal', `${stored} AND file.storedInternal = TRUE`),
		...usage('objectStorage', `${stored} AND file.storedInternal = FALSE AND file.storedInColdStorage = FALSE`),
		...usage('coldStorage', `${stored} AND file.storedInColdStorage = TRUE`),
		...usage('local', `${stored} AND file.userHost IS NULL`),
		...usage('remote', `${stored} AND file.userHost IS NOT NULL`),
		['COUNT(*) FILTER (WHERE file.isLink = TRUE)', 'linkCount'] as const,
	];

	const query = DriveFiles.createQueryBuilder('file');

	// 先頭は select() にしないと、エンティティの全カラムが
	// 集計と一緒に選択されてしまう
	let first = true;

	for (const [expression, alias] of selects) {
		if (first) {
			query.select(expression, alias);
			first = false;
		} else {
			query.addSelect(expression, alias);
		}
	}

	const raw = await query.getRawOne();

	const pick = (alias: string): Usage => ({
		count: toNumber(raw[`${alias}Count`]),
		size: toNumber(raw[`${alias}Size`]),
	});

	return {
		total: pick('total'),
		internal: pick('internal'),
		objectStorage: pick('objectStorage'),
		coldStorage: pick('coldStorage'),
		local: pick('local'),
		remote: pick('remote'),
		linkCount: toNumber(raw.linkCount),
		migration: await calcMigrationStats(),
	};
}

async function calcMigrationStats(): Promise<StorageStats['migration']> {
	if (!isColdStorageConfigured()) {
		return {
			available: false,
			olderThanDays: null,
			migratable: null,
		};
	}

	const raw = await createColdStorageTargetQuery(getColdStorageThreshold())
		.select('COUNT(*)', 'count')
		.addSelect('COALESCE(SUM(file.size), 0)', 'size')
		.getRawOne();

	return {
		available: true,
		olderThanDays: config.drive.coldStorage!.olderThanDays ?? DEFAULT_OLDER_THAN_DAYS,
		migratable: {
			count: toNumber(raw.count),
			size: toNumber(raw.size),
		},
	};
}

import { DriveFiles } from '../../models';
import { createColdStorageTargetQuery, getColdStorageThreshold } from './cold-storage-query';
import { DEFAULT_OLDER_THAN_DAYS } from './cold-storage-util';
import { isColdStorageConfigured } from './s3';
import config from '../../config';

export type Usage = {
	count: number;
	size: number;
};

/**
 * ローカル/リモートで分けた使用量
 */
export type UsageByOrigin = {
	local: Usage;
	remote: Usage;
	total: Usage;
};

export type StorageStats = {
	/** 実体を保持しているファイル全体 */
	total: UsageByOrigin;
	/** 内部ストレージ(fs)に置かれているもの */
	internal: UsageByOrigin;
	/** 通常のオブジェクトストレージに置かれているもの */
	objectStorage: UsageByOrigin;
	/** 退避先(コールドストレージ)に置かれているもの */
	coldStorage: UsageByOrigin;
	/** 実体を持たない(直リンクの)ファイル */
	link: UsageByOrigin;
	migration: {
		/** 退避先が設定されているか */
		available: boolean;
		/** 何日より古いファイルを退避対象とするか */
		olderThanDays: number | null;
		/** いま退避できるファイル (退避先が未設定ならnull) */
		migratable: Usage | null;
	};
};

/** 実体を保持しているファイル */
const STORED = 'file.isLink = FALSE';

/** 保存先ごとの絞り込み */
const PLACES = {
	total: STORED,
	internal: `${STORED} AND file.storedInternal = TRUE`,
	objectStorage: `${STORED} AND file.storedInternal = FALSE AND file.storedInColdStorage = FALSE`,
	coldStorage: `${STORED} AND file.storedInColdStorage = TRUE`,
	link: 'file.isLink = TRUE',
};

/** ローカル/リモートの絞り込み */
const ORIGINS = {
	local: 'file.userHost IS NULL',
	remote: 'file.userHost IS NOT NULL',
	total: 'TRUE',
};

type Place = keyof typeof PLACES;
type Origin = keyof typeof ORIGINS;

function toNumber(value: any): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

/**
 * 保存先ごと、かつローカル/リモートごとのドライブ使用量を集計する
 *
 * total = internal + objectStorage + coldStorage
 * (直リンクのファイルは実体を持たないので link に分けている)
 */
export async function calcStorageStats(): Promise<StorageStats> {
	const selects: [string, string][] = [];

	for (const [place, placeCondition] of Object.entries(PLACES)) {
		for (const [origin, originCondition] of Object.entries(ORIGINS)) {
			const condition = `${placeCondition} AND ${originCondition}`;
			selects.push([`COUNT(*) FILTER (WHERE ${condition})`, `${place}_${origin}_count`]);
			selects.push([`COALESCE(SUM(file.size) FILTER (WHERE ${condition}), 0)`, `${place}_${origin}_size`]);
		}
	}

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

	const pick = (place: Place): UsageByOrigin => {
		const usage = (origin: Origin): Usage => ({
			count: toNumber(raw[`${place}_${origin}_count`]),
			size: toNumber(raw[`${place}_${origin}_size`]),
		});

		return { local: usage('local'), remote: usage('remote'), total: usage('total') };
	};

	return {
		total: pick('total'),
		internal: pick('internal'),
		objectStorage: pick('objectStorage'),
		coldStorage: pick('coldStorage'),
		link: pick('link'),
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

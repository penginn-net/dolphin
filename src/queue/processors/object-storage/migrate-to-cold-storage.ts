import * as Bull from 'bull';

import { queueLogger } from '../../logger';
import {
	createColdStorageTargetQuery,
	getColdStorageThreshold,
	isColdStorageConfigured,
	moveFileToColdStorage
} from '../../../services/drive/cold-storage';

const logger = queueLogger.createSubLogger('migrate-to-cold-storage');

export default async function migrateToColdStorage(job: Bull.Job, done: any): Promise<void> {
	if (!isColdStorageConfigured()) {
		logger.warn('cold storage is not configured. skipped.');
		done();
		return;
	}

	const threshold = getColdStorageThreshold();

	logger.info(`Moving drive files older than ${threshold.toISOString()} to the cold storage...`);

	const total = await createColdStorageTargetQuery(threshold).getCount();

	if (total === 0) {
		job.progress(100);
		logger.succ('There is no file to move.');
		done();
		return;
	}

	let processedCount = 0;
	let movedCount = 0;
	let cursor: string | null = null;

	while (true) {
		const query = createColdStorageTargetQuery(threshold)
			.orderBy('file.id', 'ASC')
			.limit(8);

		if (cursor) query.andWhere('file.id > :cursor', { cursor });

		const files = await query.getMany();

		if (files.length === 0) break;

		cursor = files[files.length - 1].id;

		for (const file of files) {
			try {
				await moveFileToColdStorage(file);
				movedCount++;
			} catch (e) {
				// 失敗したファイルは移動元に残したまま次に進む
				logger.error(`Failed to move ${file.id}: ${e}`);
			}

			processedCount++;
			job.progress(Math.min(100, processedCount / total * 100));
		}
	}

	job.progress(100);

	logger.succ(`${movedCount} of ${processedCount} drive files have been moved to the cold storage.`);
	done();
}

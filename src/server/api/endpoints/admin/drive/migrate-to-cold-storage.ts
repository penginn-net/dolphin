import define from '../../../define';
import { ApiError } from '../../../error';
import { createMigrateToColdStorageJob } from '../../../../../queue';
import { isColdStorageConfigured } from '../../../../../services/drive/cold-storage';

export const meta = {
	desc: {
		'ja-JP': 'アクセス頻度が低い古い添付ファイルを退避先のオブジェクトストレージに移動します。'
	},

	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,

	errors: {
		coldStorageNotConfigured: {
			message: 'Cold storage is not configured.',
			code: 'COLD_STORAGE_NOT_CONFIGURED',
			id: '2c3fa2b4-2e39-4b0e-8d1d-3a3a67b7d5f6'
		}
	}
};

export default define(meta, async (ps, me) => {
	if (!isColdStorageConfigured()) throw new ApiError(meta.errors.coldStorageNotConfigured);

	createMigrateToColdStorageJob();
});

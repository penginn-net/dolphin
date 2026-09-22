import define from '../../../define';
import { calcStorageStats } from '../../../../../services/drive/storage-stats';

const usage = {
	type: 'object' as const,
	optional: false as const, nullable: false as const,
	properties: {
		count: {
			type: 'number' as const,
			optional: false as const, nullable: false as const,
			description: 'The count of the files.',
		},
		size: {
			type: 'number' as const,
			optional: false as const, nullable: false as const,
			description: 'The total size (bytes) of the files.',
		},
	},
};

const usageByOrigin = {
	type: 'object' as const,
	optional: false as const, nullable: false as const,
	properties: {
		local: usage,
		remote: usage,
		total: usage,
	},
};

export const meta = {
	desc: {
		'ja-JP': '保存先ごと、かつローカル/リモートごとのドライブ使用量を取得します。'
	},

	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,

	params: {},

	res: {
		type: 'object' as const,
		optional: false as const, nullable: false as const,
		properties: {
			total: usageByOrigin,
			internal: usageByOrigin,
			objectStorage: usageByOrigin,
			coldStorage: usageByOrigin,
			link: usageByOrigin,
			migration: {
				type: 'object' as const,
				optional: false as const, nullable: false as const,
				properties: {
					available: {
						type: 'boolean' as const,
						optional: false as const, nullable: false as const,
						description: 'Whether the cold storage is configured.',
					},
					olderThanDays: {
						type: 'number' as const,
						optional: false as const, nullable: true as const,
						description: 'The age (days) at which a file becomes movable to the cold storage.',
					},
					migratable: {
						...usage,
						nullable: true as const,
					},
				},
			},
		},
	},
};

export default define(meta, async () => {
	return await calcStorageStats();
});

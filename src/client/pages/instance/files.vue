<template>
<div class="dp-instance-files">
	<section class="_section">
		<div class="title"><fa :icon="faChartPie"/> {{ $t('storageUsage') }}</div>
		<div class="content" v-if="stats">
			<div class="table-wrap">
				<table class="usage">
					<thead>
						<tr>
							<th rowspan="2" class="place">{{ $t('_storage.place') }}</th>
							<th colspan="2">{{ $t('_storage.local') }}</th>
							<th colspan="2">{{ $t('_storage.remote') }}</th>
							<th colspan="2">{{ $t('_storage.total') }}</th>
						</tr>
						<tr>
							<th>{{ $t('_storage.count') }}</th>
							<th>{{ $t('_storage.size') }}</th>
							<th>{{ $t('_storage.count') }}</th>
							<th>{{ $t('_storage.size') }}</th>
							<th>{{ $t('_storage.count') }}</th>
							<th>{{ $t('_storage.size') }}</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="row in rows" :key="row.key">
							<th class="place">{{ $t(`_storage.${row.key}`) }}</th>
							<template v-for="origin in ['local', 'remote', 'total']">
								<td :key="`${row.key}-${origin}-count`">{{ row.usage[origin].count | number }}</td>
								<td :key="`${row.key}-${origin}-size`">
									<template v-if="row.hasSize">{{ row.usage[origin].size | bytes }}</template>
									<template v-else>-</template>
								</td>
							</template>
						</tr>
					</tbody>
					<tfoot>
						<tr>
							<th class="place">{{ $t('_storage.total') }}</th>
							<template v-for="origin in ['local', 'remote', 'total']">
								<td :key="`total-${origin}-count`">{{ stats.total[origin].count | number }}</td>
								<td :key="`total-${origin}-size`">{{ stats.total[origin].size | bytes }}</td>
							</template>
						</tr>
					</tfoot>
				</table>
			</div>
		</div>
	</section>

	<section class="_section">
		<div class="title"><fa :icon="faCloud"/> {{ $t('files') }}</div>
		<div class="content" v-if="stats && stats.migration.available">
			<div class="note">
				{{ $t('_storage.migratableDescription', { days: stats.migration.olderThanDays }) }}
				<b>{{ stats.migration.migratable.size | bytes }}</b>
				({{ $t('_storage.nFiles', { n: stats.migration.migratable.count }) }})
			</div>
		</div>
		<div class="content">
			<x-button primary @click="clear()"><fa :icon="faTrashAlt"/> {{ $t('clearCachedFiles') }}</x-button>
			<x-button
				v-if="stats && stats.migration.available"
				:disabled="stats.migration.migratable.count === 0"
				@click="migrateToColdStorage()"
			><fa :icon="faSnowflake"/> {{ $t('migrateFilesToColdStorage') }}</x-button>
		</div>
	</section>
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { faChartPie, faCloud } from '@fortawesome/free-solid-svg-icons';
import { faSnowflake, faTrashAlt } from '@fortawesome/free-regular-svg-icons';
import XButton from '../../components/ui/button.vue';
import XPagination from '../../components/ui/pagination.vue';
import i18n from '../../i18n';

export default Vue.extend({
	i18n,

	metaInfo() {
		return {
			title: `${this.$t('files')} | ${this.$t('instance')}`
		};
	},

	components: {
		XButton,
		XPagination,
	},

	data() {
		return {
			stats: null,
			faTrashAlt, faCloud, faChartPie, faSnowflake
		}
	},

	computed: {
		// 件数が0の保存先は出さない
		rows(): any[] {
			if (this.stats == null) return [];

			return [
				{ key: 'internal', usage: this.stats.internal, hasSize: true },
				{ key: 'objectStorage', usage: this.stats.objectStorage, hasSize: true },
				{ key: 'coldStorage', usage: this.stats.coldStorage, hasSize: true },
				// 直リンクは実体を持たないので容量は出さない
				{ key: 'link', usage: this.stats.link, hasSize: false },
			].filter(row => row.usage.total.count > 0);
		}
	},

	created() {
		this.fetchStats();
	},

	methods: {
		fetchStats() {
			this.$root.api('admin/drive/storage-stats', {}).then(stats => {
				this.stats = stats;
			});
		},

		clear() {
			this.$root.dialog({
				type: 'warning',
				text: this.$t('clearCachedFilesConfirm'),
				showCancelButton: true
			}).then(({ canceled }) => {
				if (canceled) return;

				this.$root.api('admin/drive/clean-remote-files', {}).then(() => {
					this.$root.dialog({
						type: 'success',
						iconOnly: true, autoClose: true
					});
					this.fetchStats();
				});
			});
		},

		migrateToColdStorage() {
			this.$root.dialog({
				type: 'warning',
				text: this.$t('migrateFilesToColdStorageConfirm'),
				showCancelButton: true
			}).then(({ canceled }) => {
				if (canceled) return;

				this.$root.api('admin/drive/migrate-to-cold-storage', {}).then(() => {
					this.$root.dialog({
						type: 'success',
						iconOnly: true, autoClose: true
					});
					this.fetchStats();
				}).catch(e => {
					this.$root.dialog({
						type: 'error',
						text: e.message || e
					});
				});
			});
		}
	}
});
</script>

<style lang="scss" scoped>
@import '../../theme';

.dp-instance-files {
	> ._section {
		> .content > .note {
			margin-bottom: 8px;
			opacity: 0.9;
		}

		> .content > ._button:disabled {
			opacity: 0.5;
			cursor: default;
		}

		// 狭い画面でも表がはみ出さないようにする
		> .content > .table-wrap {
			overflow-x: auto;
		}

		table.usage {
			width: 100%;
			border-collapse: collapse;
			white-space: nowrap;

			th, td {
				padding: 4px 8px;
				text-align: right;
			}

			th.place {
				text-align: left;
				font-weight: normal;
			}

			thead th {
				font-weight: normal;
				opacity: 0.7;
				border-bottom: solid 1px var(--divider);
			}

			tfoot th, tfoot td {
				border-top: solid 1px var(--divider);
				font-weight: bold;
			}
		}
	}
}
</style>

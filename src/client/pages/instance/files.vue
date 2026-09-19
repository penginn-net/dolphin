<template>
<div class="dp-instance-files">
	<section class="_section">
		<div class="title"><fa :icon="faChartPie"/> {{ $t('storageUsage') }}</div>
		<div class="content usage" v-if="stats">
			<div class="row total">
				<b>{{ $t('_storage.total') }}</b>
				<span>{{ stats.total.size | bytes }}</span>
				<span class="count">{{ stats.total.count | number }}</span>
			</div>
			<div class="row" v-if="stats.internal.count > 0">
				<b>{{ $t('_storage.internal') }}</b>
				<span>{{ stats.internal.size | bytes }}</span>
				<span class="count">{{ stats.internal.count | number }}</span>
			</div>
			<div class="row" v-if="stats.objectStorage.count > 0">
				<b>{{ $t('_storage.objectStorage') }}</b>
				<span>{{ stats.objectStorage.size | bytes }}</span>
				<span class="count">{{ stats.objectStorage.count | number }}</span>
			</div>
			<div class="row" v-if="stats.coldStorage.count > 0">
				<b>{{ $t('_storage.coldStorage') }}</b>
				<span>{{ stats.coldStorage.size | bytes }}</span>
				<span class="count">{{ stats.coldStorage.count | number }}</span>
			</div>
			<div class="row">
				<b>{{ $t('_storage.local') }}</b>
				<span>{{ stats.local.size | bytes }}</span>
				<span class="count">{{ stats.local.count | number }}</span>
			</div>
			<div class="row">
				<b>{{ $t('_storage.remote') }}</b>
				<span>{{ stats.remote.size | bytes }}</span>
				<span class="count">{{ stats.remote.count | number }}</span>
			</div>
			<div class="row" v-if="stats.linkCount > 0">
				<b>{{ $t('_storage.link') }}</b>
				<span>-</span>
				<span class="count">{{ stats.linkCount | number }}</span>
			</div>
		</div>
	</section>

	<section class="_section">
		<div class="title"><fa :icon="faCloud"/> {{ $t('files') }}</div>
		<div class="content" v-if="stats && stats.migration.available">
			<div class="migratable">
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
		> .usage {
			> .row {
				display: flex;
				padding: 4px 0;

				> b {
					flex: 1;
					font-weight: normal;
					opacity: 0.7;
				}

				> span {
					text-align: right;
					min-width: 80px;
				}

				> .count {
					opacity: 0.7;
				}

				&.total {
					border-bottom: solid 1px var(--divider);
					margin-bottom: 4px;
					padding-bottom: 8px;

					> b {
						font-weight: bold;
						opacity: 1;
					}
				}
			}
		}

		> .content > .migratable {
			margin-bottom: 8px;
			opacity: 0.9;
		}

		> .content > ._button:disabled {
			opacity: 0.5;
			cursor: default;
		}
	}
}
</style>

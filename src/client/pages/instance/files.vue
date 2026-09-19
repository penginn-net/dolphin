<template>
<section class="_section">
	<div class="title"><fa :icon="faCloud"/> {{ $t('files') }}</div>
	<div class="content">
		<x-button primary @click="clear()"><fa :icon="faTrashAlt"/> {{ $t('clearCachedFiles') }}</x-button>
		<x-button @click="migrateToColdStorage()"><fa :icon="faSnowflake"/> {{ $t('migrateFilesToColdStorage') }}</x-button>
	</div>
</section>
</template>

<script lang="ts">
import Vue from 'vue';
import { faCloud } from '@fortawesome/free-solid-svg-icons';
import { faTrashAlt, faSnowflake } from '@fortawesome/free-regular-svg-icons';
import XButton from '../../components/ui/button.vue';
import XPagination from '../../components/ui/pagination.vue';

export default Vue.extend({
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
			faTrashAlt, faCloud, faSnowflake
		}
	},

	methods: {
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

</style>

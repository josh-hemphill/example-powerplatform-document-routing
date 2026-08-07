<script setup lang="ts">
import { computed } from 'vue';
import { useConfirmDialog } from '@/composables/use-confirm-dialog';

const { open, options, resolve } = useConfirmDialog();

const title = computed(() => options.value?.title ?? 'Confirm');
const message = computed(() => options.value?.message ?? '');
const confirmText = computed(() => options.value?.confirmText ?? 'Confirm');
const cancelText = computed(() => options.value?.cancelText ?? 'Cancel');
const color = computed(() => options.value?.color ?? 'primary');
</script>

<template>
	<v-dialog
		:model-value="open"
		max-width="480"
		persistent
		@update:model-value="(value) => { if (!value) resolve(false) }"
	>
		<v-card class="pa-2">
			<v-card-title class="text-h6">
				{{ title }}
			</v-card-title>
			<v-card-text class="text-body-1">
				{{ message }}
			</v-card-text>
			<v-card-actions class="justify-end flex-wrap ga-2">
				<v-btn
					variant="text"
					@click="resolve(false)"
				>
					{{ cancelText }}
				</v-btn>
				<v-btn
					:color="color"
					variant="flat"
					@click="resolve(true)"
				>
					{{ confirmText }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

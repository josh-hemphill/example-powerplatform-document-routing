<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useConfirmDialog } from '@/composables/use-confirm-dialog';

const { open, options, resolve } = useConfirmDialog();

const title = computed(() => options.value?.title ?? 'Confirm');
const message = computed(() => options.value?.message ?? '');
const confirmText = computed(() => options.value?.confirmText ?? 'Confirm');
const cancelText = computed(() => options.value?.cancelText ?? 'Cancel');
const color = computed(() => options.value?.color ?? 'primary');
const isDestructive = computed(() => color.value === 'error');

const cancelBtn = ref<{ $el?: HTMLElement } | null>(null);
const confirmBtn = ref<{ $el?: HTMLElement } | null>(null);

watch(open, async(isOpen) => {
	if (!isOpen) {
		return;
	}
	await nextTick();
	const target = isDestructive.value ? cancelBtn.value : confirmBtn.value;
	const el = target?.$el ?? target;
	if (el instanceof HTMLElement) {
		el.focus();
	}
});
</script>

<template>
	<v-dialog
		:model-value="open"
		max-width="480"
		persistent
		aria-labelledby="confirm-dialog-title"
		aria-describedby="confirm-dialog-message"
		@update:model-value="(value) => { if (!value) resolve(false) }"
	>
		<v-card class="pa-2">
			<v-card-title
				id="confirm-dialog-title"
				class="text-h6"
			>
				{{ title }}
			</v-card-title>
			<v-card-text
				id="confirm-dialog-message"
				class="text-body-1"
			>
				{{ message }}
			</v-card-text>
			<v-card-actions class="justify-end flex-wrap ga-2">
				<v-btn
					ref="cancelBtn"
					variant="text"
					@click="resolve(false)"
				>
					{{ cancelText }}
				</v-btn>
				<v-btn
					ref="confirmBtn"
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

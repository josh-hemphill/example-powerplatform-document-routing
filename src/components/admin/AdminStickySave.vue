<script setup lang="ts">
defineProps<{
	dirty: boolean;
	canAct: boolean;
	loading: boolean;
	message: string;
}>();

const emit = defineEmits<{
	save: [];
}>();
</script>

<template>
	<div
		v-if="dirty"
		class="admin-sticky-save"
		role="status"
	>
		<span class="text-body-2">{{ message }}</span>
		<v-btn
			color="primary"
			size="small"
			:disabled="!canAct"
			:loading="loading"
			@click="emit('save')"
		>
			Save
		</v-btn>
	</div>
</template>

<style scoped>
.admin-sticky-save {
	position: sticky;
	bottom: 0;
	z-index: 2;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	margin-top: 1rem;
	padding: 0.75rem 1rem;
	background: rgb(var(--v-theme-surface));
	border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
	border-radius: 8px;
	box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
}
</style>

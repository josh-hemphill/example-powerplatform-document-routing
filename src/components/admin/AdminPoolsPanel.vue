<script setup lang="ts">
import type { Approver, ControlApproverPool } from '@/client';
import { useMutation, useQuery, useQueryCache } from '@pinia/colada';
import { computed, reactive, watch } from 'vue';
import { getApiErrorMessage } from '@/api/api-error';
import {
	listApproverPoolsQuery,
	listApproverPoolsQueryKey,
	listDocumentTypesQueryKey,
	listPublishDestinationsQueryKey,
	updateApproverPoolMutation,
} from '@/client/@pinia/colada.gen';
import AdminStickySave from '@/components/admin/AdminStickySave.vue';
import PoolMembersEditor from '@/components/admin/PoolMembersEditor.vue';
import { useAdminDirtyForm } from '@/composables/use-admin-dirty-form';
import { useAdminSelectionGuard } from '@/composables/use-admin-selection-guard';

defineProps<{
	canAct: boolean;
}>();

const emit = defineEmits<{
	error: [message: string | null];
	success: [message: string | null];
}>();

const dirtyModel = defineModel<boolean>('dirty', { required: true });
const queryCache = useQueryCache();

const { data: poolsData, isPending: poolsLoading } = useQuery(() => listApproverPoolsQuery());
const pools = computed(() => poolsData.value?.items ?? []);

const form = reactive({
	name: '',
	description: '',
	members: [] as Approver[],
});

function snapshot(): string {
	return JSON.stringify({
		name: form.name,
		description: form.description,
		members: form.members,
	});
}

const { dirty, markClean, captureBaseline } = useAdminDirtyForm(snapshot);

function hydrate(pool: ControlApproverPool): void {
	form.name = pool.name;
	form.description = pool.description;
	form.members = structuredClone(pool.members);
	captureBaseline();
}

const { selectedId } = useAdminSelectionGuard<ControlApproverPool>({
	items: pools,
	getId: (pool) => pool.id,
	hydrate,
	isDirty: dirty,
	confirmTitle: 'Discard unsaved pool changes?',
	confirmMessage: 'Switching pools will lose edits that have not been saved.',
});

watch(
	dirty,
	(value) => {
		dirtyModel.value = value;
	},
	{ immediate: true },
);

async function invalidateControl(): Promise<void> {
	await Promise.all([
		queryCache.invalidateQueries({ key: listDocumentTypesQueryKey() }),
		queryCache.invalidateQueries({ key: listApproverPoolsQueryKey() }),
		queryCache.invalidateQueries({ key: listPublishDestinationsQueryKey() }),
	]);
}

const { mutateAsync: saveAsync, isLoading: saving } = useMutation({
	...updateApproverPoolMutation(),
	async onSettled() {
		await invalidateControl();
	},
});

async function save(): Promise<void> {
	emit('error', null);
	emit('success', null);
	if (!selectedId.value) {
		return;
	}
	try {
		await saveAsync({
			path: { poolId: selectedId.value },
			body: {
				name: form.name,
				description: form.description,
				members: form.members,
			},
		});
		markClean();
		emit('success', 'Pool updated. New submits resolve live membership.');
	}
	catch(error) {
		emit('error', getApiErrorMessage(error, 'Failed to save pool'));
	}
}
</script>

<template>
	<v-card
		class="pa-4 pb-16"
		:loading="poolsLoading"
	>
		<v-select
			v-model="selectedId"
			:items="pools"
			item-title="name"
			item-value="id"
			label="Approver pool"
			class="mb-3"
		/>
		<v-text-field v-model="form.name" label="Name" class="mb-2" />
		<v-text-field v-model="form.description" label="Description" class="mb-4" />
		<PoolMembersEditor
			v-model="form.members"
			class="mb-4"
		/>
		<div class="d-flex justify-end">
			<v-btn
				color="primary"
				:disabled="!canAct || !dirty"
				:loading="saving"
				@click="save"
			>
				Save pool members
			</v-btn>
		</div>
	</v-card>
	<AdminStickySave
		:dirty="dirty"
		:can-act="canAct"
		:loading="saving"
		message="Unsaved pool changes"
		@save="save"
	/>
</template>

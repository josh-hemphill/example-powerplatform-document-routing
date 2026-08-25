<script setup lang="ts">
import type { Approver, ControlApproverPool } from '@/client';
import { useMutation, useQuery, useQueryCache } from '@pinia/colada';
import { computed, reactive, watch } from 'vue';
import { getApiErrorMessage } from '@/api/api-error';
import {
	createApproverPoolMutation,
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
import { useConfirmDialog } from '@/composables/use-confirm-dialog';
import { useIdentityStore } from '@/stores/identity';

defineProps<{
	canAct: boolean;
}>();

const emit = defineEmits<{
	error: [message: string | null];
	success: [message: string | null];
}>();

const dirtyModel = defineModel<boolean>('dirty', { required: true });
const queryCache = useQueryCache();
const { confirm } = useConfirmDialog();
const identity = useIdentityStore();

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

const { mutateAsync: createAsync, isLoading: creating } = useMutation({
	...createApproverPoolMutation(),
	async onSettled() {
		await invalidateControl();
	},
});

async function createPool(): Promise<void> {
	emit('error', null);
	emit('success', null);
	if (dirty.value) {
		const ok = await confirm({
			title: 'Discard unsaved pool changes?',
			message: 'Creating a new pool will lose edits that have not been saved.',
			confirmText: 'Discard',
			color: 'warning',
		});
		if (!ok) {
			return;
		}
	}
	const email = identity.email?.trim() || 'admin@example.com';
	const displayName = identity.userName?.trim() || email;
	try {
		const created = await createAsync({
			body: {
				name: 'New approver pool',
				description: '',
				members: [{ email, displayName, role: 'Approver' }],
			},
		});
		selectedId.value = created.id;
		emit('success', 'Approver pool created. Update members and save.');
	}
	catch(error) {
		emit('error', getApiErrorMessage(error, 'Failed to create pool'));
	}
}

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
		<div class="d-flex align-end flex-wrap ga-2 mb-3">
			<v-select
				v-model="selectedId"
				:items="pools"
				item-title="name"
				item-value="id"
				label="Approver pool"
				class="flex-grow-1"
				style="min-width: 12rem"
			/>
			<v-btn
				color="primary"
				variant="tonal"
				prepend-icon="$plus"
				:disabled="!canAct"
				:loading="creating"
				@click="createPool"
			>
				New pool
			</v-btn>
		</div>
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

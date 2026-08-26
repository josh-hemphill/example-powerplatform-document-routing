<script setup lang="ts">
import type { PriorityLevel } from '@/client';
import { useMutation, useQuery, useQueryCache } from '@pinia/colada';
import { computed, reactive, watch } from 'vue';
import { getApiErrorMessage } from '@/api/api-error';
import {
	createPriorityLevelMutation,
	listPriorityLevelsQuery,
	listPriorityLevelsQueryKey,
	updatePriorityLevelMutation,
} from '@/client/@pinia/colada.gen';
import AdminStickySave from '@/components/admin/AdminStickySave.vue';
import { useAdminDirtyForm } from '@/composables/use-admin-dirty-form';
import { useAdminSelectionGuard } from '@/composables/use-admin-selection-guard';
import { MISSION_CRITICAL_REASON_MIN_LENGTH } from '@/domain/priority-catalog';

defineProps<{
	canAct: boolean;
}>();

const emit = defineEmits<{
	error: [message: string | null];
	success: [message: string | null];
}>();

const dirtyModel = defineModel<boolean>('dirty', { required: true });
const queryCache = useQueryCache();

const { data: priorityData, isPending } = useQuery(() => listPriorityLevelsQuery());
const items = computed(() => priorityData.value?.items ?? []);

const colorItems = [
	{ title: 'Default', value: 'default' },
	{ title: 'Info', value: 'info' },
	{ title: 'Warning', value: 'warning' },
	{ title: 'Error', value: 'error' },
];

const form = reactive({
	key: '',
	label: '',
	rank: 0,
	color: 'default' as PriorityLevel['color'],
	requiresReason: false,
	minReasonLength: 0,
	reasonHint: '',
	active: true,
	slaHoursMultiplier: null as number | null,
});

function snapshot(): string {
	return JSON.stringify({ ...form });
}

const { dirty, markClean, captureBaseline } = useAdminDirtyForm(snapshot);

function hydrate(row: PriorityLevel): void {
	form.key = row.key;
	form.label = row.label;
	form.rank = row.rank;
	form.color = row.color;
	form.requiresReason = row.requiresReason;
	form.minReasonLength = row.minReasonLength;
	form.reasonHint = row.reasonHint ?? '';
	form.active = row.active;
	form.slaHoursMultiplier = row.slaHoursMultiplier ?? null;
	captureBaseline();
}

const { selectedId } = useAdminSelectionGuard<PriorityLevel>({
	items,
	getId: (row) => row.id,
	hydrate,
	isDirty: dirty,
	confirmTitle: 'Discard unsaved priority changes?',
	confirmMessage: 'Switching priority rows will lose edits that have not been saved.',
});

watch(
	dirty,
	(value) => {
		dirtyModel.value = value;
	},
	{ immediate: true },
);

async function invalidate(): Promise<void> {
	await queryCache.invalidateQueries({ key: listPriorityLevelsQueryKey() });
}

const { mutateAsync: saveAsync, isLoading: saving } = useMutation({
	...updatePriorityLevelMutation(),
	async onSettled() {
		await invalidate();
	},
});

const { mutateAsync: createAsync, isLoading: creating } = useMutation({
	...createPriorityLevelMutation(),
	async onSettled() {
		await invalidate();
	},
});

const savingAny = computed(() => saving.value || creating.value);

async function save(): Promise<void> {
	emit('error', null);
	emit('success', null);
	if (!selectedId.value) {
		return;
	}
	if (form.requiresReason && form.minReasonLength < 1) {
		form.minReasonLength = MISSION_CRITICAL_REASON_MIN_LENGTH;
	}
	try {
		await saveAsync({
			path: { priorityId: selectedId.value },
			body: {
				key: form.key,
				label: form.label,
				rank: form.rank,
				color: form.color,
				requiresReason: form.requiresReason,
				minReasonLength: form.minReasonLength,
				reasonHint: form.reasonHint,
				active: form.active,
				slaHoursMultiplier: form.slaHoursMultiplier,
			},
		});
		markClean();
		emit('success', 'Priority level saved. New creates use this catalog.');
	}
	catch(error) {
		emit('error', getApiErrorMessage(error, 'Failed to save priority'));
	}
}

async function addPriority(): Promise<void> {
	emit('error', null);
	emit('success', null);
	try {
		const created = await createAsync({
			body: {
				key: `priority_${items.value.length + 1}`,
				label: 'New priority',
				rank: (items.value.at(-1)?.rank ?? 0) + 10,
				color: 'default',
				requiresReason: false,
				minReasonLength: 0,
				reasonHint: '',
				active: true,
			},
		});
		selectedId.value = created.id;
		emit('success', 'Priority row added. Edit the key and label, then save.');
	}
	catch(error) {
		emit('error', getApiErrorMessage(error, 'Failed to add priority'));
	}
}
</script>

<template>
	<v-card
		class="pa-4 pb-16"
		:loading="isPending"
	>
		<p class="text-body-2 text-medium-emphasis mb-3">
			Catalog keys are stored on each case. Deactivating a row hides it from New request.
			<code>requiresReason</code> is enforced server-side (mission-critical cannot be saved without a reason).
		</p>
		<div class="d-flex align-center flex-wrap ga-2 mb-3">
			<v-select
				v-model="selectedId"
				:items="items"
				item-title="label"
				item-value="id"
				label="Priority level"
				hide-details
				class="flex-grow-1"
				style="min-width: 12rem"
			/>
			<v-btn
				color="primary"
				variant="tonal"
				prepend-icon="$plus"
				:disabled="!canAct"
				:loading="creating"
				@click="addPriority"
			>
				Add priority
			</v-btn>
		</div>
		<v-text-field
			v-model="form.key"
			label="Key"
			disabled
			class="mb-2"
			hint="Keys are immutable after create so in-flight cases keep a stable catalog match."
			persistent-hint
		/>
		<v-text-field
			v-model="form.label"
			label="Label"
			class="mb-2"
		/>
		<v-text-field
			v-model.number="form.rank"
			label="Rank (higher floats in inbox)"
			type="number"
			class="mb-2"
		/>
		<v-select
			v-model="form.color"
			:items="colorItems"
			label="Chip color"
			class="mb-2"
		/>
		<v-switch
			v-model="form.requiresReason"
			label="Requires reason"
			color="primary"
			class="mb-2"
		/>
		<v-text-field
			v-if="form.requiresReason"
			v-model.number="form.minReasonLength"
			label="Minimum reason length"
			type="number"
			min="1"
			class="mb-2"
		/>
		<v-textarea
			v-if="form.requiresReason"
			v-model="form.reasonHint"
			label="Reason hint"
			rows="2"
			class="mb-2"
		/>
		<v-switch
			v-model="form.active"
			label="Active"
			color="primary"
			class="mb-4"
		/>
		<div class="d-flex justify-end">
			<v-btn
				color="primary"
				:disabled="!canAct || !dirty"
				:loading="savingAny"
				@click="save"
			>
				Save priority
			</v-btn>
		</div>
	</v-card>
	<AdminStickySave
		:dirty="dirty"
		:can-act="canAct"
		:loading="savingAny"
		message="Unsaved priority changes"
		@save="save"
	/>
</template>

<script setup lang="ts">
import type {
	ControlApproverPool,
	ControlChainStep,
	ControlDocumentType,
	DocumentSubtype,
} from '@/client';
import { useMutation, useQuery, useQueryCache } from '@pinia/colada';
import { computed, reactive, watch } from 'vue';
import { getApiErrorMessage } from '@/api/api-error';
import {
	createDocumentSubtypeMutation,
	listApproverPoolsQuery,
	listApproverPoolsQueryKey,
	listDocumentTypesQuery,
	listDocumentTypesQueryKey,
	listPublishDestinationsQuery,
	listPublishDestinationsQueryKey,
	updateDocumentSubtypeMutation,
	updateDocumentTypeMutation,
} from '@/client/@pinia/colada.gen';
import AdminStickySave from '@/components/admin/AdminStickySave.vue';
import AdminSubtypesEditor from '@/components/admin/AdminSubtypesEditor.vue';
import ApprovalChainEditor from '@/components/admin/ApprovalChainEditor.vue';
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

const { data: typesData, isPending: typesLoading } = useQuery(() => listDocumentTypesQuery());
const { data: poolsData } = useQuery(() => listApproverPoolsQuery());
const { data: destinationsData } = useQuery(() => listPublishDestinationsQuery());

const types = computed(() => typesData.value?.items ?? []);
const pools = computed(() => poolsData.value?.items ?? []);
const destinations = computed(() => destinationsData.value?.items ?? []);

const form = reactive({
	label: '',
	description: '',
	requestHint: '',
	draftTemplate: '',
	folderPath: '',
	authorTeamEmails: '',
	active: true,
	defaultDestinationId: null as string | null,
	numberPrefix: '',
	numberPattern: '',
	nextSequence: 1,
	approvalChain: [] as ControlChainStep[],
	subtypes: [] as DocumentSubtype[],
});

function snapshot(): string {
	return JSON.stringify({
		label: form.label,
		description: form.description,
		requestHint: form.requestHint,
		draftTemplate: form.draftTemplate,
		folderPath: form.folderPath,
		authorTeamEmails: form.authorTeamEmails,
		active: form.active,
		defaultDestinationId: form.defaultDestinationId,
		numberPrefix: form.numberPrefix,
		numberPattern: form.numberPattern,
		nextSequence: form.nextSequence,
		approvalChain: form.approvalChain,
		subtypes: form.subtypes,
	});
}

const { dirty, markClean, captureBaseline } = useAdminDirtyForm(snapshot);

function hydrate(type: ControlDocumentType): void {
	form.label = type.label;
	form.description = type.description;
	form.requestHint = type.requestHint;
	form.draftTemplate = type.draftTemplate;
	form.folderPath = type.folderPath ?? '';
	form.authorTeamEmails = (type.authorTeamEmails ?? []).join(', ');
	form.active = type.active;
	form.defaultDestinationId = type.defaultDestinationId ?? null;
	form.numberPrefix = type.numberPrefix ?? type.id.slice(0, 3).toUpperCase();
	form.numberPattern = type.numberPattern ?? '{prefix}-{yyyy}-{seq:5}';
	form.nextSequence = type.nextSequence ?? 1;
	form.approvalChain = structuredClone(type.approvalChain);
	form.subtypes = structuredClone(type.subtypes ?? []);
	captureBaseline();
}

const { selectedId } = useAdminSelectionGuard<ControlDocumentType>({
	items: types,
	getId: (type) => type.id,
	hydrate,
	isDirty: dirty,
	confirmTitle: 'Discard unsaved document type changes?',
	confirmMessage: 'Switching types will lose edits that have not been saved.',
});

const poolSelectItems = computed(() =>
	pools.value.map((pool: ControlApproverPool) => ({ title: `${pool.name} (${pool.key})`, value: pool.key })),
);

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
	...updateDocumentTypeMutation(),
	async onSettled() {
		await invalidateControl();
	},
});

const { mutateAsync: createSubtypeAsync } = useMutation({
	...createDocumentSubtypeMutation(),
});

const { mutateAsync: updateSubtypeAsync } = useMutation({
	...updateDocumentSubtypeMutation(),
});

async function save(): Promise<void> {
	emit('error', null);
	emit('success', null);
	if (!selectedId.value) {
		return;
	}
	const numberPrefix = form.numberPrefix.trim();
	const numberPattern = form.numberPattern.trim() || '{prefix}-{yyyy}-{seq:5}';
	const nextSequence = Number(form.nextSequence);
	if (!Number.isFinite(nextSequence) || !Number.isInteger(nextSequence) || nextSequence < 1) {
		emit('error', 'Next sequence must be an integer greater than or equal to 1.');
		return;
	}
	try {
		await saveAsync({
			path: { typeId: selectedId.value },
			body: {
				id: selectedId.value,
				label: form.label,
				description: form.description,
				requestHint: form.requestHint,
				draftTemplate: form.draftTemplate,
				folderPath: form.folderPath || undefined,
				authorTeamEmails: form.authorTeamEmails
					.split(',')
					.map((item) => item.trim())
					.filter(Boolean),
				active: form.active,
				defaultDestinationId: form.defaultDestinationId ?? undefined,
				numberPrefix: numberPrefix || undefined,
				numberPattern,
				nextSequence,
				approvalChain: form.approvalChain,
			},
		});
		for (const subtype of form.subtypes) {
			const body = {
				key: subtype.key,
				label: subtype.label,
				description: subtype.description,
				documentTypeId: selectedId.value,
				active: subtype.active,
				requestHint: subtype.requestHint,
				draftScaffold: subtype.draftScaffold,
				numberPrefix: subtype.numberPrefix,
				usesOwnChain: subtype.usesOwnChain,
				approvalChain: subtype.approvalChain,
			};
			if (subtype.id.startsWith('new:')) {
				await createSubtypeAsync({ body });
			}
			else {
				await updateSubtypeAsync({
					path: { subtypeId: subtype.id },
					body,
				});
			}
		}
		await invalidateControl();
		markClean();
		emit('success', 'Document type saved. Next submit uses this chain/pools.');
	}
	catch(error) {
		emit('error', getApiErrorMessage(error, 'Failed to save type'));
	}
}
</script>

<template>
	<v-card
		class="pa-4 pb-16"
		:loading="typesLoading"
	>
		<v-select
			v-model="selectedId"
			:items="types"
			item-title="label"
			item-value="id"
			label="Document type"
			class="mb-3"
		/>
		<v-text-field v-model="form.label" label="Label" class="mb-2" />
		<v-text-field v-model="form.description" label="Description" class="mb-2" />
		<v-text-field v-model="form.requestHint" label="Request hint" class="mb-2" />
		<v-text-field v-model="form.folderPath" label="Default folder" class="mb-2" />
		<v-text-field
			v-model="form.authorTeamEmails"
			label="Author team emails (comma-separated)"
			class="mb-2"
		/>
		<v-select
			v-model="form.defaultDestinationId"
			:items="destinations"
			item-title="name"
			item-value="id"
			label="Default publish destination"
			clearable
			class="mb-2"
		/>
		<v-text-field
			v-model="form.numberPrefix"
			label="Number prefix"
			class="mb-2"
		/>
		<v-text-field
			v-model="form.numberPattern"
			label="Number pattern"
			hint="{prefix}-{yyyy}-{seq:5}"
			persistent-hint
			class="mb-2"
		/>
		<v-text-field
			v-model.number="form.nextSequence"
			label="Next sequence"
			type="number"
			min="1"
			class="mb-2"
		/>
		<v-switch
			v-model="form.active"
			label="Active"
			color="primary"
			class="mb-2"
		/>
		<v-textarea
			v-model="form.draftTemplate"
			label="Draft scaffold"
			rows="6"
			class="mb-4"
		/>
		<ApprovalChainEditor
			v-model="form.approvalChain"
			:pool-keys="poolSelectItems"
			class="mb-4"
		/>
		<AdminSubtypesEditor
			v-if="selectedId"
			v-model="form.subtypes"
			:document-type-id="selectedId"
			:pool-keys="poolSelectItems"
		/>
		<div class="d-flex justify-end">
			<v-btn
				color="primary"
				:disabled="!canAct || !dirty"
				:loading="saving"
				@click="save"
			>
				Save document type
			</v-btn>
		</div>
	</v-card>
	<AdminStickySave
		:dirty="dirty"
		:can-act="canAct"
		:loading="saving"
		message="Unsaved document type changes"
		@save="save"
	/>
</template>

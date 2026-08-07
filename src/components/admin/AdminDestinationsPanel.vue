<script setup lang="ts">
import type { ControlPublishDestination } from '@/client';
import { useMutation, useQuery, useQueryCache } from '@pinia/colada';
import { computed, reactive, watch } from 'vue';
import { getApiErrorMessage } from '@/api/api-error';
import {
	listApproverPoolsQueryKey,
	listDocumentTypesQueryKey,
	listPublishDestinationsQuery,
	listPublishDestinationsQueryKey,
	updatePublishDestinationMutation,
} from '@/client/@pinia/colada.gen';
import AdminStickySave from '@/components/admin/AdminStickySave.vue';
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

const { data: destinationsData } = useQuery(() => listPublishDestinationsQuery());
const destinations = computed(() => destinationsData.value?.items ?? []);

const form = reactive({
	name: '',
	siteUrl: '',
	libraryName: '',
	folderPath: '',
	active: true,
});

function snapshot(): string {
	return JSON.stringify({ ...form });
}

const { dirty, markClean, captureBaseline } = useAdminDirtyForm(snapshot);

function hydrate(destination: ControlPublishDestination): void {
	form.name = destination.name;
	form.siteUrl = destination.siteUrl;
	form.libraryName = destination.libraryName;
	form.folderPath = destination.folderPath;
	form.active = destination.active;
	captureBaseline();
}

const { selectedId } = useAdminSelectionGuard<ControlPublishDestination>({
	items: destinations,
	getId: (destination) => destination.id,
	hydrate,
	isDirty: dirty,
	confirmTitle: 'Discard unsaved destination changes?',
	confirmMessage: 'Switching destinations will lose edits that have not been saved.',
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
	...updatePublishDestinationMutation(),
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
			path: { destinationId: selectedId.value },
			body: {
				name: form.name,
				siteUrl: form.siteUrl,
				libraryName: form.libraryName,
				folderPath: form.folderPath,
				active: form.active,
			},
		});
		markClean();
		emit('success', 'Publish destination saved.');
	}
	catch(error) {
		emit('error', getApiErrorMessage(error, 'Failed to save destination'));
	}
}
</script>

<template>
	<v-card class="pa-4 pb-16">
		<v-select
			v-model="selectedId"
			:items="destinations"
			item-title="name"
			item-value="id"
			label="Publish destination"
			class="mb-3"
		/>
		<v-text-field v-model="form.name" label="Name" class="mb-2" />
		<v-text-field v-model="form.siteUrl" label="Site URL (HTTPS)" class="mb-2" />
		<v-text-field v-model="form.libraryName" label="Library" class="mb-2" />
		<v-text-field v-model="form.folderPath" label="Folder" class="mb-2" />
		<v-switch
			v-model="form.active"
			label="Active"
			color="primary"
			class="mb-3"
		/>
		<div class="d-flex justify-end">
			<v-btn
				color="primary"
				:disabled="!canAct || !dirty"
				:loading="saving"
				@click="save"
			>
				Save destination
			</v-btn>
		</div>
	</v-card>
	<AdminStickySave
		:dirty="dirty"
		:can-act="canAct"
		:loading="saving"
		message="Unsaved destination changes"
		@save="save"
	/>
</template>

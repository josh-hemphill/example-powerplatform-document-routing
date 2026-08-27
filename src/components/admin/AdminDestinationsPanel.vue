<script setup lang="ts">
import type { ControlPublishDestination } from '@/client';
import { useMutation, useQuery, useQueryCache } from '@pinia/colada';
import { computed, reactive, watch } from 'vue';
import { getApiErrorMessage } from '@/api/api-error';
import {
	createPublishDestinationMutation,
	listApproverPoolsQueryKey,
	listDocumentTypesQueryKey,
	listPublishDestinationsQuery,
	listPublishDestinationsQueryKey,
	updatePublishDestinationMutation,
} from '@/client/@pinia/colada.gen';
import AdminStickySave from '@/components/admin/AdminStickySave.vue';
import { useAdminDirtyForm } from '@/composables/use-admin-dirty-form';
import { useAdminSelectionGuard } from '@/composables/use-admin-selection-guard';
import { useConfirmDialog } from '@/composables/use-confirm-dialog';
import { appConfig } from '@/config/app.config';
import { uniqueLabel } from '@/utils/slugify-id';

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

const { mutateAsync: createAsync, isLoading: creating } = useMutation({
	...createPublishDestinationMutation(),
	async onSettled() {
		await invalidateControl();
	},
});

async function createDestination(): Promise<void> {
	emit('error', null);
	emit('success', null);
	if (dirty.value) {
		const ok = await confirm({
			title: 'Discard unsaved destination changes?',
			message: 'Creating a new destination will lose edits that have not been saved.',
			confirmText: 'Discard',
			color: 'warning',
		});
		if (!ok) {
			return;
		}
	}
	const name = uniqueLabel(
		'New publish destination',
		destinations.value.map((destination) => destination.name),
		'destination',
	);
	try {
		const created = await createAsync({
			body: {
				name,
				siteUrl: appConfig.sharePoint.siteUrl,
				libraryName: appConfig.sharePoint.libraryName,
				folderPath: appConfig.sharePoint.folderPath,
				active: true,
			},
		});
		// Mark clean only after create succeeds so a failed create keeps edits dirty.
		markClean();
		selectedId.value = created.id;
		emit('success', 'Publish destination created. Update the fields and save.');
	}
	catch(error) {
		emit('error', getApiErrorMessage(error, 'Failed to create destination'));
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
		<div class="d-flex align-end flex-wrap ga-2 mb-3">
			<v-select
				v-model="selectedId"
				:items="destinations"
				item-title="name"
				item-value="id"
				label="Publish destination"
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
				@click="createDestination"
			>
				New destination
			</v-btn>
		</div>
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

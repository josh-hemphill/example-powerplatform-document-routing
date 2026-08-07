<script setup lang="ts">
import type { ControlSettings } from '@/client';
import { useMutation, useQuery } from '@pinia/colada';
import { reactive, watch } from 'vue';
import { getApiErrorMessage } from '@/api/api-error';
import {
	getControlSettingsQuery,
	updateControlSettingsMutation,
} from '@/client/@pinia/colada.gen';
import AdminStickySave from '@/components/admin/AdminStickySave.vue';
import { useAdminDirtyForm } from '@/composables/use-admin-dirty-form';

defineProps<{
	canAct: boolean;
}>();

const emit = defineEmits<{
	error: [message: string | null];
	success: [message: string | null];
}>();

const dirtyModel = defineModel<boolean>('dirty', { required: true });

const { data: settingsData } = useQuery(() => getControlSettingsQuery());

const form = reactive({
	allowApproverOverride: false,
	collaborationMode: '',
});

function snapshot(): string {
	return JSON.stringify({ ...form });
}

const { dirty, markClean, captureBaseline } = useAdminDirtyForm(snapshot);

function hydrate(settings: ControlSettings): void {
	form.allowApproverOverride = settings.allowApproverOverride;
	form.collaborationMode = settings.collaborationMode;
	captureBaseline();
}

watch(
	settingsData,
	(value) => {
		if (!value) {
			return;
		}
		hydrate(value);
	},
	{ immediate: true },
);

watch(
	dirty,
	(value) => {
		dirtyModel.value = value;
	},
	{ immediate: true },
);

const { mutateAsync: saveAsync, isLoading: saving } = useMutation({
	...updateControlSettingsMutation(),
});

async function save(): Promise<void> {
	emit('error', null);
	emit('success', null);
	try {
		await saveAsync({
			body: {
				allowApproverOverride: form.allowApproverOverride,
				collaborationMode: form.collaborationMode,
				namedElevationSemantics: 'convert_to_elevated_pool',
			},
		});
		markClean();
		emit('success', 'Settings saved.');
	}
	catch(error) {
		emit('error', getApiErrorMessage(error, 'Failed to save settings'));
	}
}
</script>

<template>
	<v-card class="pa-4 pb-16">
		<v-switch
			v-model="form.allowApproverOverride"
			color="primary"
			label="Allow Admin-authorized chain override at submit"
			class="mb-2"
		/>
		<p class="text-body-2 text-medium-emphasis mb-4">
			Default off. When off, submit always materializes the chain from control
			tables / pools. When on, only an <strong>Admin</strong> may supply override
			steps at submit &mdash; requesters and authors cannot invent approvers.
		</p>
		<v-text-field
			v-model="form.collaborationMode"
			label="Collaboration mode"
			class="mb-3"
		/>
		<div class="d-flex justify-end">
			<v-btn
				color="primary"
				:disabled="!canAct || !dirty"
				:loading="saving"
				@click="save"
			>
				Save settings
			</v-btn>
		</div>
	</v-card>
	<AdminStickySave
		:dirty="dirty"
		:can-act="canAct"
		:loading="saving"
		message="Unsaved settings changes"
		@save="save"
	/>
</template>

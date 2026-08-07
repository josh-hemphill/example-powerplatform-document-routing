<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import AdminDestinationsPanel from '@/components/admin/AdminDestinationsPanel.vue';
import AdminFlowsPanel from '@/components/admin/AdminFlowsPanel.vue';
import AdminPoolsPanel from '@/components/admin/AdminPoolsPanel.vue';
import AdminSettingsPanel from '@/components/admin/AdminSettingsPanel.vue';
import AdminTypesPanel from '@/components/admin/AdminTypesPanel.vue';
import { useConfirmDialog } from '@/composables/use-confirm-dialog';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { useIdentityStore } from '@/stores/identity';

const router = useRouter();
const identity = useIdentityStore();
const { canAct } = usePowerAppsContext();
const { confirm } = useConfirmDialog();

const isAdmin = computed(() => identity.hasRole('admin'));
const tab = ref('types');
const actionError = ref<string | null>(null);
const actionSuccess = ref<string | null>(null);

const typeDirty = ref(false);
const poolDirty = ref(false);
const destinationDirty = ref(false);
const settingsDirty = ref(false);

const anyDirty = computed(
	() => typeDirty.value || poolDirty.value || destinationDirty.value || settingsDirty.value,
);

watch(
	isAdmin,
	(value) => {
		if (!value && identity.isReady) {
			void router.replace({ name: 'inbox' });
		}
	},
	{ immediate: true },
);

function onError(message: string | null): void {
	actionError.value = message;
	if (message) {
		actionSuccess.value = null;
	}
}

function onSuccess(message: string | null): void {
	actionSuccess.value = message;
	if (message) {
		actionError.value = null;
	}
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
	if (!anyDirty.value) {
		return;
	}
	event.preventDefault();
	event.returnValue = '';
}

onMounted(() => {
	window.addEventListener('beforeunload', onBeforeUnload);
});

onUnmounted(() => {
	window.removeEventListener('beforeunload', onBeforeUnload);
});

onBeforeRouteLeave(async() => {
	if (!anyDirty.value) {
		return true;
	}
	return await confirm({
		title: 'Leave Admin with unsaved changes?',
		message: 'Changes on the current tab have not been saved.',
		confirmText: 'Leave',
		color: 'warning',
	});
});
</script>

<template>
	<div>
		<v-alert
			v-if="!isAdmin"
			type="warning"
			variant="tonal"
			class="mb-4"
		>
			Admin role required. Switch to the Local developer persona in DEV, or assign
			Document Routing Admin in Dataverse.
		</v-alert>

		<template v-else>
			<v-alert
				v-if="actionError"
				type="error"
				variant="tonal"
				class="mb-4"
				role="alert"
			>
				{{ actionError }}
			</v-alert>
			<v-alert
				v-if="actionSuccess"
				type="success"
				variant="tonal"
				class="mb-4"
				role="status"
			>
				{{ actionSuccess }}
			</v-alert>

			<p class="text-body-2 text-medium-emphasis mb-4">
				Edits write to the control store (Dataverse control tables when hosted).
				Changing a pool member affects the next submit without rebuilding the app.
			</p>

			<v-tabs
				v-model="tab"
				color="primary"
				class="mb-4"
			>
				<v-tab value="types">
					Document types
					<span
						v-if="typeDirty"
						class="text-caption ms-1"
					>(unsaved)</span>
				</v-tab>
				<v-tab value="pools">
					Pools
					<span
						v-if="poolDirty"
						class="text-caption ms-1"
					>(unsaved)</span>
				</v-tab>
				<v-tab value="destinations">
					Destinations
					<span
						v-if="destinationDirty"
						class="text-caption ms-1"
					>(unsaved)</span>
				</v-tab>
				<v-tab value="settings">
					Settings
					<span
						v-if="settingsDirty"
						class="text-caption ms-1"
					>(unsaved)</span>
				</v-tab>
				<v-tab value="flows">
					Flow health
				</v-tab>
			</v-tabs>

			<v-tabs-window v-model="tab">
				<v-tabs-window-item value="types">
					<AdminTypesPanel
						v-model:dirty="typeDirty"
						:can-act="canAct"
						@error="onError"
						@success="onSuccess"
					/>
				</v-tabs-window-item>

				<v-tabs-window-item value="pools">
					<AdminPoolsPanel
						v-model:dirty="poolDirty"
						:can-act="canAct"
						@error="onError"
						@success="onSuccess"
					/>
				</v-tabs-window-item>

				<v-tabs-window-item value="destinations">
					<AdminDestinationsPanel
						v-model:dirty="destinationDirty"
						:can-act="canAct"
						@error="onError"
						@success="onSuccess"
					/>
				</v-tabs-window-item>

				<v-tabs-window-item value="settings">
					<AdminSettingsPanel
						v-model:dirty="settingsDirty"
						:can-act="canAct"
						@error="onError"
						@success="onSuccess"
					/>
				</v-tabs-window-item>

				<v-tabs-window-item value="flows">
					<AdminFlowsPanel />
				</v-tabs-window-item>
			</v-tabs-window>
		</template>
	</div>
</template>

<script setup lang="ts">
import type { ControlApproverPool, ControlDocumentType, ControlPublishDestination } from '@/client';
import { useMutation, useQuery, useQueryCache } from '@pinia/colada';
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getApiErrorMessage } from '@/api/api-error';
import {
	getControlSettingsQuery,
	listApproverPoolsQuery,
	listApproverPoolsQueryKey,
	listDocumentTypesQuery,
	listDocumentTypesQueryKey,
	listFlowRunsQuery,
	listPublishDestinationsQuery,
	listPublishDestinationsQueryKey,
	updateApproverPoolMutation,
	updateControlSettingsMutation,
	updateDocumentTypeMutation,
	updatePublishDestinationMutation,
} from '@/client/@pinia/colada.gen';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { useIdentityStore } from '@/stores/identity';

const router = useRouter();
const queryCache = useQueryCache();
const identity = useIdentityStore();
const { canAct } = usePowerAppsContext();

const isAdmin = computed(() => identity.hasRole('admin'));
const tab = ref('types');
const actionError = ref<string | null>(null);
const actionSuccess = ref<string | null>(null);

watch(
	isAdmin,
	(value) => {
		if (!value && identity.isReady) {
			void router.replace({ name: 'inbox' });
		}
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

const { data: typesData, isPending: typesLoading } = useQuery(() => listDocumentTypesQuery());
const { data: poolsData, isPending: poolsLoading } = useQuery(() => listApproverPoolsQuery());
const { data: destinationsData } = useQuery(() => listPublishDestinationsQuery());
const { data: settingsData } = useQuery(() => getControlSettingsQuery());
const { data: flowRunsData } = useQuery(() => listFlowRunsQuery());

const types = computed(() => typesData.value?.items ?? []);
const pools = computed(() => poolsData.value?.items ?? []);
const destinations = computed(() => destinationsData.value?.items ?? []);
const flowRuns = computed(() => flowRunsData.value?.items ?? []);

const selectedTypeId = ref<string | null>(null);
const selectedPoolId = ref<string | null>(null);
const selectedDestinationId = ref<string | null>(null);

const typeForm = reactive({
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
	chainJson: '',
});

const poolForm = reactive({
	name: '',
	description: '',
	membersJson: '',
});

const destinationForm = reactive({
	name: '',
	siteUrl: '',
	libraryName: '',
	folderPath: '',
	active: true,
});

const settingsForm = reactive({
	allowApproverOverride: false,
	collaborationMode: '',
});

watch(
	types,
	(items) => {
		if (!selectedTypeId.value && items[0]) {
			selectedTypeId.value = items[0].id;
		}
	},
	{ immediate: true },
);

watch(
	pools,
	(items) => {
		if (!selectedPoolId.value && items[0]) {
			selectedPoolId.value = items[0].id;
		}
	},
	{ immediate: true },
);

watch(
	destinations,
	(items) => {
		if (!selectedDestinationId.value && items[0]) {
			selectedDestinationId.value = items[0].id;
		}
	},
	{ immediate: true },
);

watch(
	[selectedTypeId, types],
	() => {
		const type = types.value.find((item) => item.id === selectedTypeId.value);
		if (!type) {
			return;
		}
		hydrateTypeForm(type);
	},
	{ immediate: true },
);

watch(
	[selectedPoolId, pools],
	() => {
		const pool = pools.value.find((item) => item.id === selectedPoolId.value);
		if (!pool) {
			return;
		}
		hydratePoolForm(pool);
	},
	{ immediate: true },
);

watch(
	[selectedDestinationId, destinations],
	() => {
		const destination = destinations.value.find(
			(item) => item.id === selectedDestinationId.value,
		);
		if (!destination) {
			return;
		}
		hydrateDestinationForm(destination);
	},
	{ immediate: true },
);

watch(
	settingsData,
	(value) => {
		if (!value) {
			return;
		}
		settingsForm.allowApproverOverride = value.allowApproverOverride;
		settingsForm.collaborationMode = value.collaborationMode;
	},
	{ immediate: true },
);

function hydrateTypeForm(type: ControlDocumentType): void {
	typeForm.label = type.label;
	typeForm.description = type.description;
	typeForm.requestHint = type.requestHint;
	typeForm.draftTemplate = type.draftTemplate;
	typeForm.folderPath = type.folderPath ?? '';
	typeForm.authorTeamEmails = (type.authorTeamEmails ?? []).join(', ');
	typeForm.active = type.active;
	typeForm.defaultDestinationId = type.defaultDestinationId ?? null;
	typeForm.numberPrefix = type.numberPrefix ?? type.id.slice(0, 3).toUpperCase();
	typeForm.numberPattern = type.numberPattern ?? '{prefix}-{yyyy}-{seq:5}';
	typeForm.nextSequence = type.nextSequence ?? 1;
	typeForm.chainJson = JSON.stringify(type.approvalChain, null, 2);
}

function hydratePoolForm(pool: ControlApproverPool): void {
	poolForm.name = pool.name;
	poolForm.description = pool.description;
	poolForm.membersJson = JSON.stringify(pool.members, null, 2);
}

function hydrateDestinationForm(destination: ControlPublishDestination): void {
	destinationForm.name = destination.name;
	destinationForm.siteUrl = destination.siteUrl;
	destinationForm.libraryName = destination.libraryName;
	destinationForm.folderPath = destination.folderPath;
	destinationForm.active = destination.active;
}

const { mutateAsync: saveTypeAsync, isLoading: savingType } = useMutation({
	...updateDocumentTypeMutation(),
	async onSettled() {
		await invalidateControl();
	},
});

const { mutateAsync: savePoolAsync, isLoading: savingPool } = useMutation({
	...updateApproverPoolMutation(),
	async onSettled() {
		await invalidateControl();
	},
});

const { mutateAsync: saveDestinationAsync, isLoading: savingDestination } = useMutation({
	...updatePublishDestinationMutation(),
	async onSettled() {
		await invalidateControl();
	},
});

const { mutateAsync: saveSettingsAsync, isLoading: savingSettings } = useMutation({
	...updateControlSettingsMutation(),
});

async function saveType(): Promise<void> {
	actionError.value = null;
	actionSuccess.value = null;
	if (!selectedTypeId.value) {
		return;
	}
	const numberPrefix = typeForm.numberPrefix.trim();
	const numberPattern = typeForm.numberPattern.trim() || '{prefix}-{yyyy}-{seq:5}';
	const nextSequence = Number(typeForm.nextSequence);
	if (!Number.isFinite(nextSequence) || !Number.isInteger(nextSequence) || nextSequence < 1) {
		actionError.value = 'Next sequence must be an integer greater than or equal to 1.';
		return;
	}
	try {
		const approvalChain = JSON.parse(typeForm.chainJson) as ControlDocumentType['approvalChain'];
		await saveTypeAsync({
			path: { typeId: selectedTypeId.value },
			body: {
				id: selectedTypeId.value,
				label: typeForm.label,
				description: typeForm.description,
				requestHint: typeForm.requestHint,
				draftTemplate: typeForm.draftTemplate,
				folderPath: typeForm.folderPath || undefined,
				authorTeamEmails: typeForm.authorTeamEmails
					.split(',')
					.map((item) => item.trim())
					.filter(Boolean),
				active: typeForm.active,
				defaultDestinationId: typeForm.defaultDestinationId ?? undefined,
				numberPrefix: numberPrefix || undefined,
				numberPattern,
				nextSequence,
				approvalChain,
			},
		});
		actionSuccess.value = 'Document type saved. Next submit uses this chain/pools.';
	}
	catch(error) {
		actionError.value = getApiErrorMessage(error, 'Failed to save type');
	}
}

async function savePool(): Promise<void> {
	actionError.value = null;
	actionSuccess.value = null;
	if (!selectedPoolId.value) {
		return;
	}
	try {
		const members = JSON.parse(poolForm.membersJson) as ControlApproverPool['members'];
		await savePoolAsync({
			path: { poolId: selectedPoolId.value },
			body: {
				name: poolForm.name,
				description: poolForm.description,
				members,
			},
		});
		actionSuccess.value = 'Pool updated. New submits resolve live membership.';
	}
	catch(error) {
		actionError.value = getApiErrorMessage(error, 'Failed to save pool');
	}
}

async function saveDestination(): Promise<void> {
	actionError.value = null;
	actionSuccess.value = null;
	if (!selectedDestinationId.value) {
		return;
	}
	try {
		await saveDestinationAsync({
			path: { destinationId: selectedDestinationId.value },
			body: {
				name: destinationForm.name,
				siteUrl: destinationForm.siteUrl,
				libraryName: destinationForm.libraryName,
				folderPath: destinationForm.folderPath,
				active: destinationForm.active,
			},
		});
		actionSuccess.value = 'Publish destination saved.';
	}
	catch(error) {
		actionError.value = getApiErrorMessage(error, 'Failed to save destination');
	}
}

async function saveSettings(): Promise<void> {
	actionError.value = null;
	actionSuccess.value = null;
	try {
		await saveSettingsAsync({
			body: {
				allowApproverOverride: settingsForm.allowApproverOverride,
				collaborationMode: settingsForm.collaborationMode,
				namedElevationSemantics: 'convert_to_elevated_pool',
			},
		});
		actionSuccess.value = 'Settings saved.';
	}
	catch(error) {
		actionError.value = getApiErrorMessage(error, 'Failed to save settings');
	}
}

const poolSelectItems = computed(() =>
	pools.value.map((pool) => ({ title: `${pool.name} (${pool.key})`, value: pool.key })),
);
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
			>
				{{ actionError }}
			</v-alert>
			<v-alert
				v-if="actionSuccess"
				type="success"
				variant="tonal"
				class="mb-4"
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
				</v-tab>
				<v-tab value="pools">
					Pools
				</v-tab>
				<v-tab value="destinations">
					Destinations
				</v-tab>
				<v-tab value="settings">
					Settings
				</v-tab>
				<v-tab value="flows">
					Flow health
				</v-tab>
			</v-tabs>

			<v-tabs-window v-model="tab">
				<v-tabs-window-item value="types">
					<v-card class="pa-4" :loading="typesLoading">
						<v-select
							v-model="selectedTypeId"
							:items="types"
							item-title="label"
							item-value="id"
							label="Document type"
							class="mb-3"
						/>
						<v-text-field v-model="typeForm.label" label="Label" class="mb-2" />
						<v-text-field v-model="typeForm.description" label="Description" class="mb-2" />
						<v-text-field v-model="typeForm.requestHint" label="Request hint" class="mb-2" />
						<v-text-field v-model="typeForm.folderPath" label="Default folder" class="mb-2" />
						<v-text-field
							v-model="typeForm.authorTeamEmails"
							label="Author team emails (comma-separated)"
							class="mb-2"
						/>
						<v-select
							v-model="typeForm.defaultDestinationId"
							:items="destinations"
							item-title="name"
							item-value="id"
							label="Default publish destination"
							clearable
							class="mb-2"
						/>
						<v-text-field
							v-model="typeForm.numberPrefix"
							label="Number prefix"
							class="mb-2"
						/>
						<v-text-field
							v-model="typeForm.numberPattern"
							label="Number pattern"
							hint="{prefix}-{yyyy}-{seq:5}"
							persistent-hint
							class="mb-2"
						/>
						<v-text-field
							v-model.number="typeForm.nextSequence"
							label="Next sequence"
							type="number"
							min="1"
							class="mb-2"
						/>
						<v-switch
							v-model="typeForm.active"
							label="Active"
							color="primary"
							class="mb-2"
						/>
						<v-textarea
							v-model="typeForm.draftTemplate"
							label="Draft scaffold"
							rows="6"
							class="mb-2"
						/>
						<v-textarea
							v-model="typeForm.chainJson"
							label="Approval chain (JSON — poolKey / elevationPoolKey)"
							rows="10"
							class="mb-2"
						/>
						<p class="text-caption text-medium-emphasis mb-3">
							Pool keys:
							{{ poolSelectItems.map(item => item.value).join(', ') || '—' }}
						</p>
						<div class="d-flex justify-end">
							<v-btn
								color="primary"
								:disabled="!canAct"
								:loading="savingType"
								@click="saveType"
							>
								Save document type
							</v-btn>
						</div>
					</v-card>
				</v-tabs-window-item>

				<v-tabs-window-item value="pools">
					<v-card class="pa-4" :loading="poolsLoading">
						<v-select
							v-model="selectedPoolId"
							:items="pools"
							item-title="name"
							item-value="id"
							label="Approver pool"
							class="mb-3"
						/>
						<v-text-field v-model="poolForm.name" label="Name" class="mb-2" />
						<v-text-field v-model="poolForm.description" label="Description" class="mb-2" />
						<v-textarea
							v-model="poolForm.membersJson"
							label="Members JSON (email, displayName)"
							rows="10"
							class="mb-3"
						/>
						<div class="d-flex justify-end">
							<v-btn
								color="primary"
								:disabled="!canAct"
								:loading="savingPool"
								@click="savePool"
							>
								Save pool members
							</v-btn>
						</div>
					</v-card>
				</v-tabs-window-item>

				<v-tabs-window-item value="destinations">
					<v-card class="pa-4">
						<v-select
							v-model="selectedDestinationId"
							:items="destinations"
							item-title="name"
							item-value="id"
							label="Publish destination"
							class="mb-3"
						/>
						<v-text-field v-model="destinationForm.name" label="Name" class="mb-2" />
						<v-text-field v-model="destinationForm.siteUrl" label="Site URL (HTTPS)" class="mb-2" />
						<v-text-field v-model="destinationForm.libraryName" label="Library" class="mb-2" />
						<v-text-field v-model="destinationForm.folderPath" label="Folder" class="mb-2" />
						<v-switch
							v-model="destinationForm.active"
							label="Active"
							color="primary"
							class="mb-3"
						/>
						<div class="d-flex justify-end">
							<v-btn
								color="primary"
								:disabled="!canAct"
								:loading="savingDestination"
								@click="saveDestination"
							>
								Save destination
							</v-btn>
						</div>
					</v-card>
				</v-tabs-window-item>

				<v-tabs-window-item value="settings">
					<v-card class="pa-4">
						<v-switch
							v-model="settingsForm.allowApproverOverride"
							color="primary"
							label="Allow Admin-authorized chain override at submit"
							class="mb-2"
						/>
						<p class="text-body-2 text-medium-emphasis mb-4">
							Default off. When off, submit always materializes the chain from control
							tables / pools. When on, only an <strong>Admin</strong> may supply override
							steps at submit — requesters and authors cannot invent approvers.
						</p>
						<v-text-field
							v-model="settingsForm.collaborationMode"
							label="Collaboration mode"
							class="mb-3"
						/>
						<div class="d-flex justify-end">
							<v-btn
								color="primary"
								:disabled="!canAct"
								:loading="savingSettings"
								@click="saveSettings"
							>
								Save settings
							</v-btn>
						</div>
					</v-card>
				</v-tabs-window-item>

				<v-tabs-window-item value="flows">
					<v-card class="pa-4">
						<p class="text-body-2 text-medium-emphasis mb-3">
							Read-only Flow health (mock log; hosted environments store runs on
							appsetting / flowrun).
						</p>
						<v-table density="comfortable">
							<thead>
								<tr>
									<th>When</th>
									<th>Flow</th>
									<th>Status</th>
									<th>Message</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="run in flowRuns" :key="run.id">
									<td>{{ new Date(run.at).toLocaleString() }}</td>
									<td>{{ run.flowName }}</td>
									<td>{{ run.status }}</td>
									<td>{{ run.message }}</td>
								</tr>
							</tbody>
						</v-table>
					</v-card>
				</v-tabs-window-item>
			</v-tabs-window>
		</template>
	</div>
</template>

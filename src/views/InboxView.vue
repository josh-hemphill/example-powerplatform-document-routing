<script setup lang="ts">
import type { DocumentStatus, DocumentSummary } from '@/client/types.gen';
import type { InboxPersona } from '@/config/inbox-personas';
import { useQuery } from '@pinia/colada';
import { computed, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useDisplay } from 'vuetify';
import { getApiErrorMessage } from '@/api/api-error';
import { listDocumentsQuery, listDocumentTypesQuery } from '@/client/@pinia/colada.gen';
import DocumentStatusChip from '@/components/DocumentStatusChip.vue';
import { useDocumentTypeLabel } from '@/composables/use-document-type-label';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { appConfig } from '@/config/app.config';
import {
	INBOX_PERSONAS,
	matchesInboxPersona,
	suggestInboxPersona,
} from '@/config/inbox-personas';
import { DOCUMENT_STATUS_LABELS } from '@/domain/document-status';
import { useIdentityStore } from '@/stores/identity';

const { mdAndUp } = useDisplay();
const { context } = usePowerAppsContext();
const identity = useIdentityStore();
const statusFilter = ref<DocumentStatus | null>(null);
const typeFilter = ref<string | null>(null);
const search = ref('');
const debouncedQ = ref('');
const persona = ref<InboxPersona>('all');
/** Email for which we already ran one-shot persona auto-select. */
const autoSelectedForEmail = ref<string | null>(null);

const cursor = ref<string | undefined>(undefined);
const accumulated = ref<DocumentSummary[]>([]);
const nextCursor = ref<string | null>(null);

const dateTime = new Intl.DateTimeFormat(undefined, {
	dateStyle: 'short',
	timeStyle: 'short',
});

function formatDate(value: string | null | undefined): string {
	if (!value) {
		return '—';
	}
	return dateTime.format(new Date(value));
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
	clearTimeout(searchTimer);
	searchTimer = setTimeout(() => {
		debouncedQ.value = value.trim();
	}, 200);
});
onUnmounted(() => {
	clearTimeout(searchTimer);
});

const statusFilterItems = computed(() => [
	{ title: 'All statuses', value: null as DocumentStatus | null },
	...(Object.entries(DOCUMENT_STATUS_LABELS) as Array<[DocumentStatus, string]>).map(
		([value, title]) => ({ title, value }),
	),
]);

const { data: typesData } = useQuery(() => listDocumentTypesQuery());
const typeSelectItems = computed(() => [
	{ title: 'All types', value: null as string | null },
	...(typesData.value?.items ?? []).map((item) => ({
		title: item.label,
		value: item.id,
	})),
]);
const { typeLabel } = useDocumentTypeLabel(() => typesData.value?.items);

const queryInput = computed(() => ({
	query: {
		status: statusFilter.value ?? undefined,
		documentType: typeFilter.value ?? undefined,
		q: debouncedQ.value || undefined,
		persona: persona.value !== 'all' ? persona.value : undefined,
		limit: 50,
		cursor: cursor.value,
	},
}));

const { data, isPending, error, refetch } = useQuery(() =>
	listDocumentsQuery(queryInput.value),
);

watch(
	[statusFilter, typeFilter, debouncedQ, persona],
	() => {
		cursor.value = undefined;
		accumulated.value = [];
		nextCursor.value = null;
	},
);

watch(
	[data, isPending],
	([page, pending]) => {
		if (pending || !page) {
			return;
		}
		const pageItems = page.items ?? [];
		if (cursor.value) {
			const existing = new Set(accumulated.value.map((item) => item.id));
			accumulated.value = [
				...accumulated.value,
				...pageItems.filter((item) => !existing.has(item.id)),
			];
		}
		else {
			accumulated.value = pageItems;
		}
		nextCursor.value = page.nextCursor ?? null;
	},
	{ immediate: true },
);

const items = computed(() =>
	accumulated.value.filter((item) =>
		matchesInboxPersona(
			item,
			persona.value,
			context.value.email,
			identity.identity.roles,
		),
	),
);

const showInitialLoader = computed(() => isPending.value && accumulated.value.length === 0);
const loadingMore = computed(() => isPending.value && Boolean(cursor.value));

const filtersActive = computed(
	() =>
		persona.value !== 'all'
		|| statusFilter.value !== null
		|| typeFilter.value !== null
		|| search.value.trim() !== '',
);

function clearFilters(): void {
	persona.value = 'all';
	statusFilter.value = null;
	typeFilter.value = null;
	search.value = '';
	debouncedQ.value = '';
}

function loadMore(): void {
	if (!nextCursor.value || isPending.value) {
		return;
	}
	cursor.value = nextCursor.value;
}

function refreshList(): void {
	const hadCursor = cursor.value !== undefined;
	cursor.value = undefined;
	accumulated.value = [];
	nextCursor.value = null;
	if (!hadCursor) {
		void refetch();
	}
}

watch(
	[() => context.value.email, accumulated],
	([email, list]) => {
		if (!email) {
			return;
		}
		// One-shot per signed-in identity — list refetches must not override a manual chip.
		if (autoSelectedForEmail.value === email) {
			return;
		}
		if (!list?.length) {
			return;
		}
		const suggested = suggestInboxPersona(list, email);
		if (suggested) {
			persona.value = suggested;
		}
		autoSelectedForEmail.value = email;
	},
	{ immediate: true },
);
</script>

<template>
	<div>
		<p class="text-body-2 text-medium-emphasis mb-2">
			{{ INBOX_PERSONAS.find((option) => option.value === persona)?.description }}
		</p>
		<p
			v-if="persona === 'all'"
			class="text-caption text-medium-emphasis mb-2"
		>
			{{ appConfig.brand.tagline }}
		</p>
		<v-chip-group
			v-model="persona"
			mandatory
			class="mb-3"
			selected-class="text-primary"
		>
			<v-chip
				v-for="option in INBOX_PERSONAS"
				:key="option.value"
				:value="option.value"
				:title="option.description"
				filter
				variant="outlined"
			>
				{{ option.title }}
			</v-chip>
		</v-chip-group>

		<v-row class="mb-2" dense>
			<v-col cols="12" md="5">
				<v-text-field
					v-model="search"
					label="Search requests"
					prepend-inner-icon="$magnify"
					clearable
					hide-details
				/>
			</v-col>
			<v-col cols="12" md="3">
				<v-select
					v-model="statusFilter"
					:items="statusFilterItems"
					label="Status"
					hide-details
				/>
			</v-col>
			<v-col cols="12" md="2">
				<v-select
					v-model="typeFilter"
					:items="typeSelectItems"
					item-title="title"
					item-value="value"
					label="Type"
					hide-details
				/>
			</v-col>
			<v-col cols="12" md="2" class="d-flex">
				<v-btn class="flex-grow-1" variant="tonal" @click="refreshList">
					Refresh
				</v-btn>
			</v-col>
		</v-row>

		<v-alert
			v-if="error"
			type="error"
			variant="tonal"
			class="mb-4"
			role="alert"
		>
			<div class="d-flex flex-wrap align-center justify-space-between ga-3">
				<div>
					{{ getApiErrorMessage(error, 'Failed to load documents') }}
				</div>
				<v-btn
					size="small"
					variant="tonal"
					@click="refreshList"
				>
					Retry
				</v-btn>
			</div>
		</v-alert>

		<v-skeleton-loader v-if="showInitialLoader" type="table" />

		<template v-else>
			<template v-if="mdAndUp">
				<div class="table-scroll">
					<v-table>
						<caption class="visually-hidden">
							Inbox documents
						</caption>
						<thead>
							<tr>
								<th
									scope="col"
									class="table-scroll__sticky"
								>
									Title
								</th>
								<th scope="col">
									Type
								</th>
								<th scope="col">
									Status
								</th>
								<th scope="col">
									Requester
								</th>
								<th scope="col">
									Updated
								</th>
							</tr>
						</thead>
						<tbody>
							<tr
								v-for="item in items"
								:key="item.id"
								class="inbox-row"
							>
								<td class="table-scroll__sticky">
									<RouterLink
										class="inbox-stretched-link"
										:to="{ name: 'document', params: { documentId: item.id } }"
									>
										<span class="font-weight-medium">
											{{ item.title }}
										</span>
										<span
											v-if="item.currentStepStatus === 'queued'"
											class="text-caption text-medium-emphasis d-block"
										>
											Pool queue
											<span v-if="item.currentStepDueAt">
												· due {{ formatDate(item.currentStepDueAt) }}
											</span>
											<span v-if="item.currentStepElevated"> · elevated</span>
										</span>
										<span
											v-else-if="item.currentApproverEmail"
											class="text-caption text-medium-emphasis d-block"
										>
											Waiting on {{ item.currentApproverEmail }}
										</span>
									</RouterLink>
								</td>
								<td>{{ typeLabel(item.documentType) }}</td>
								<td>
									<DocumentStatusChip :status="item.status" />
								</td>
								<td>{{ item.requesterEmail }}</td>
								<td>{{ formatDate(item.updatedAt) }}</td>
							</tr>
							<tr v-if="items.length === 0">
								<td colspan="5" class="text-medium-emphasis py-8 text-center">
									<p class="mb-4">
										No documents match this view. Create a request or switch persona filters.
									</p>
									<div class="d-flex flex-wrap justify-center ga-2">
										<v-btn
											color="primary"
											:to="{ name: 'new-request' }"
										>
											New request
										</v-btn>
										<v-btn
											v-if="filtersActive"
											variant="tonal"
											@click="clearFilters"
										>
											Clear filters
										</v-btn>
									</div>
								</td>
							</tr>
						</tbody>
					</v-table>
				</div>
			</template>

			<template v-else>
				<v-virtual-scroll
					v-if="items.length > 20"
					:items="items"
					:item-height="120"
					height="70vh"
					item-key="id"
				>
					<template #default="{ item }">
						<v-card
							class="mb-3 pa-3 inbox-card"
							variant="outlined"
						>
							<RouterLink
								class="inbox-stretched-link"
								:to="{ name: 'document', params: { documentId: item.id } }"
							>
								<span class="font-weight-medium d-block mb-1">
									{{ item.title }}
								</span>
							</RouterLink>
							<div class="d-flex flex-wrap align-center ga-2 mb-2">
								<DocumentStatusChip :status="item.status" />
								<span class="text-caption text-medium-emphasis">
									{{ typeLabel(item.documentType) }}
								</span>
							</div>
							<div class="text-caption text-medium-emphasis">
								{{ item.requesterEmail }}
								· {{ formatDate(item.updatedAt) }}
							</div>
							<div
								v-if="item.currentStepStatus === 'queued'"
								class="text-caption text-medium-emphasis mt-1"
							>
								Pool queue
								<span v-if="item.currentStepDueAt">
									· due {{ formatDate(item.currentStepDueAt) }}
								</span>
								<span v-if="item.currentStepElevated"> · elevated</span>
							</div>
							<div
								v-else-if="item.currentApproverEmail"
								class="text-caption text-medium-emphasis mt-1"
							>
								Waiting on {{ item.currentApproverEmail }}
							</div>
						</v-card>
					</template>
				</v-virtual-scroll>
				<template v-else>
					<v-card
						v-for="item in items"
						:key="item.id"
						class="mb-3 pa-3 inbox-card"
						variant="outlined"
					>
						<RouterLink
							class="inbox-stretched-link"
							:to="{ name: 'document', params: { documentId: item.id } }"
						>
							<span class="font-weight-medium d-block mb-1">
								{{ item.title }}
							</span>
						</RouterLink>
						<div class="d-flex flex-wrap align-center ga-2 mb-2">
							<DocumentStatusChip :status="item.status" />
							<span class="text-caption text-medium-emphasis">
								{{ typeLabel(item.documentType) }}
							</span>
						</div>
						<div class="text-caption text-medium-emphasis">
							{{ item.requesterEmail }}
							· {{ formatDate(item.updatedAt) }}
						</div>
						<div
							v-if="item.currentStepStatus === 'queued'"
							class="text-caption text-medium-emphasis mt-1"
						>
							Pool queue
							<span v-if="item.currentStepDueAt">
								· due {{ formatDate(item.currentStepDueAt) }}
							</span>
							<span v-if="item.currentStepElevated"> · elevated</span>
						</div>
						<div
							v-else-if="item.currentApproverEmail"
							class="text-caption text-medium-emphasis mt-1"
						>
							Waiting on {{ item.currentApproverEmail }}
						</div>
					</v-card>
					<div
						v-if="items.length === 0"
						class="text-medium-emphasis py-8 text-center"
					>
						<p class="mb-4">
							No documents match this view. Create a request or switch persona filters.
						</p>
						<div class="d-flex flex-wrap justify-center ga-2">
							<v-btn
								color="primary"
								:to="{ name: 'new-request' }"
							>
								New request
							</v-btn>
							<v-btn
								v-if="filtersActive"
								variant="tonal"
								@click="clearFilters"
							>
								Clear filters
							</v-btn>
						</div>
					</div>
				</template>
			</template>

			<div
				v-if="nextCursor"
				class="d-flex justify-center mt-4"
			>
				<v-btn
					variant="tonal"
					:loading="loadingMore"
					@click="loadMore"
				>
					Load more
				</v-btn>
			</div>
		</template>
	</div>
</template>

<style scoped>
.inbox-row,
.inbox-card {
	position: relative;
}

.inbox-row:hover,
.inbox-card:hover {
	background: rgba(var(--v-theme-on-surface), 0.04);
}

.inbox-stretched-link {
	color: inherit;
	text-decoration: none;
	outline-offset: 2px;
}

.inbox-stretched-link::after {
	content: '';
	position: absolute;
	inset: 0;
	z-index: 2;
}

.inbox-stretched-link:focus-visible {
	outline: none;
}

.inbox-stretched-link:focus-visible::after {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: -2px;
}

.table-scroll {
	overflow-x: auto;
	-webkit-overflow-scrolling: touch;
}

.table-scroll__sticky {
	position: sticky;
	left: 0;
	z-index: 1;
	background: rgb(var(--v-theme-surface));
	min-width: 12rem;
}

.visually-hidden {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
</style>

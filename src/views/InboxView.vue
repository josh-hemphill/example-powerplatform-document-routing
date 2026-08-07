<script setup lang="ts">
import type { DocumentStatus } from '@/client/types.gen';
import type { InboxPersona } from '@/config/inbox-personas';
import { useQuery } from '@pinia/colada';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { getApiErrorMessage } from '@/api/api-error';
import { listDocumentsQuery, listDocumentTypesQuery } from '@/client/@pinia/colada.gen';
import DocumentStatusChip from '@/components/DocumentStatusChip.vue';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { findDocumentType } from '@/config/document-types';
import {
	INBOX_PERSONAS,
	matchesInboxPersona,
	suggestInboxPersona,
} from '@/config/inbox-personas';
import { DOCUMENT_STATUS_LABELS } from '@/domain/document-status';

const { context } = usePowerAppsContext();
const statusFilter = ref<DocumentStatus | null>(null);
const typeFilter = ref<string | null>(null);
const search = ref('');
const persona = ref<InboxPersona>('all');
/** Email for which we already ran one-shot persona auto-select. */
const autoSelectedForEmail = ref<string | null>(null);

const statusFilterItems = computed(() => [
	{ title: 'All statuses', value: null as DocumentStatus | null },
	...(Object.entries(DOCUMENT_STATUS_LABELS) as Array<[DocumentStatus, string]>).map(
		([value, title]) => ({ title, value }),
	),
]);

const { data: typesData } = useQuery(() => listDocumentTypesQuery());
const typeSelectItems = computed(() =>
	(typesData.value?.items ?? []).map((item) => ({
		title: item.label,
		value: item.id,
	})),
);

function typeLabel(id: string): string {
	return typesData.value?.items?.find((item) => item.id === id)?.label
		?? findDocumentType(id)?.label
		?? id;
}

const queryInput = computed(() => ({
	query: {
		status: statusFilter.value ?? undefined,
		documentType: typeFilter.value ?? undefined,
		q: search.value.trim() || undefined,
	},
}));

const { data, isPending, error, refetch } = useQuery(() =>
	listDocumentsQuery(queryInput.value),
);

const items = computed(() => {
	const list = data.value?.items ?? [];
	return list.filter((item) =>
		matchesInboxPersona(item, persona.value, context.value.email),
	);
});

watch(
	[() => context.value.email, () => data.value?.items],
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
					:items="[{ title: 'All types', value: null }, ...typeSelectItems]"
					item-title="title"
					item-value="value"
					label="Type"
					hide-details
				/>
			</v-col>
			<v-col cols="12" md="2" class="d-flex">
				<v-btn class="flex-grow-1" variant="tonal" @click="() => refetch()">
					Refresh
				</v-btn>
			</v-col>
		</v-row>

		<v-alert
			v-if="error"
			type="error"
			variant="tonal"
			class="mb-4"
		>
			{{ getApiErrorMessage(error, 'Failed to load documents') }}
		</v-alert>

		<v-skeleton-loader v-if="isPending" type="table" />

		<template v-else>
			<!-- Mobile / narrow: stacked cards -->
			<div class="d-md-none">
				<v-card
					v-for="item in items"
					:key="item.id"
					class="mb-3 pa-3"
					variant="outlined"
				>
					<RouterLink
						class="inbox-row__link"
						:to="{ name: 'document', params: { documentId: item.id } }"
					>
						<div class="font-weight-medium mb-1">
							{{ item.title }}
						</div>
					</RouterLink>
					<div class="d-flex flex-wrap align-center ga-2 mb-2">
						<DocumentStatusChip :status="item.status" />
						<span class="text-caption text-medium-emphasis">
							{{ typeLabel(item.documentType) }}
						</span>
					</div>
					<div class="text-caption text-medium-emphasis">
						{{ item.requesterEmail }}
						· {{ new Date(item.updatedAt).toLocaleString() }}
					</div>
					<div
						v-if="item.currentStepStatus === 'queued'"
						class="text-caption text-medium-emphasis mt-1"
					>
						Pool queue
						<span v-if="item.currentStepDueAt">
							· due {{ new Date(item.currentStepDueAt).toLocaleString() }}
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
				<p
					v-if="items.length === 0"
					class="text-medium-emphasis py-8 text-center"
				>
					No documents match this view. Create a request or switch persona filters.
				</p>
			</div>

			<!-- Desktop table with horizontal scroll + sticky title -->
			<div class="d-none d-md-block table-scroll">
				<v-table hover>
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
									class="inbox-row__link"
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
											· due {{ new Date(item.currentStepDueAt).toLocaleString() }}
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
							<td>{{ new Date(item.updatedAt).toLocaleString() }}</td>
						</tr>
						<tr v-if="items.length === 0">
							<td colspan="5" class="text-medium-emphasis py-8 text-center">
								No documents match this view. Create a request or switch persona filters.
							</td>
						</tr>
					</tbody>
				</v-table>
			</div>
		</template>
	</div>
</template>

<style scoped>
.inbox-row:hover {
	background: rgba(var(--v-theme-on-surface), 0.04);
}

.inbox-row__link {
	display: block;
	color: inherit;
	text-decoration: none;
	outline-offset: 2px;
}

.inbox-row__link:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
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
</style>

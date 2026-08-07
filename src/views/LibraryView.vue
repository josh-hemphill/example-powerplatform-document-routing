<script setup lang="ts">
import { useQuery } from '@pinia/colada';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { getApiErrorMessage } from '@/api/api-error';
import {
	listDocumentTypesQuery,
	listLibraryDocumentsQuery,
} from '@/client/@pinia/colada.gen';
import DocumentStatusChip from '@/components/DocumentStatusChip.vue';

const search = ref('');
const typeFilter = ref<string | null>(null);
const includeSuperseded = ref(false);
const debouncedQ = ref('');

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
	clearTimeout(searchTimer);
	searchTimer = setTimeout(() => {
		debouncedQ.value = value.trim();
	}, 200);
});

const { data, isPending, error, refetch } = useQuery(() =>
	listLibraryDocumentsQuery({
		query: {
			q: debouncedQ.value || undefined,
			documentType: typeFilter.value ?? undefined,
			includeSuperseded: includeSuperseded.value || undefined,
		},
	}),
);

const { data: typesData } = useQuery(() => listDocumentTypesQuery());

const typeSelectItems = computed(() =>
	(typesData.value?.items ?? []).map((item) => ({
		title: item.label,
		value: item.id,
	})),
);

function typeLabel(id: string): string {
	return typesData.value?.items?.find((item) => item.id === id)?.label ?? id;
}

const items = computed(() => data.value?.items ?? []);

function isOpenable(item: { documentNumber?: string | null; status: string }): boolean {
	return Boolean(item.documentNumber && item.status === 'published');
}
</script>

<template>
	<div>
		<v-row class="mb-4" dense>
			<v-col cols="12" md="5">
				<v-text-field
					v-model="search"
					label="Search number, title, or type"
					prepend-inner-icon="$magnify"
					clearable
					hide-details
				/>
			</v-col>
			<v-col cols="12" md="3">
				<v-select
					v-model="typeFilter"
					:items="[{ title: 'All types', value: null }, ...typeSelectItems]"
					item-title="title"
					item-value="value"
					label="Type"
					hide-details
				/>
			</v-col>
			<v-col cols="12" md="2" class="d-flex align-center">
				<v-switch
					v-model="includeSuperseded"
					label="Include superseded"
					hide-details
					density="compact"
					color="primary"
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
			role="alert"
		>
			<div class="d-flex flex-wrap align-center justify-space-between ga-3">
				<div>
					{{ getApiErrorMessage(error, 'Failed to load library') }}
				</div>
				<v-btn
					size="small"
					variant="tonal"
					@click="() => refetch()"
				>
					Retry
				</v-btn>
			</div>
		</v-alert>

		<v-skeleton-loader v-if="isPending" type="table" />

		<template v-else>
			<div class="d-md-none">
				<v-card
					v-for="item in items"
					:key="item.id"
					class="mb-3 pa-3"
					:class="{ 'library-card--clickable': isOpenable(item) }"
					variant="outlined"
				>
					<template v-if="isOpenable(item) && item.documentNumber">
						<RouterLink
							class="library-stretched-link"
							:to="{ name: 'library-document', params: { documentNumber: item.documentNumber } }"
						>
							<span class="font-weight-medium d-block mb-1">
								{{ item.documentNumber }}
							</span>
						</RouterLink>
					</template>
					<div
						v-else
						class="font-weight-medium mb-1"
					>
						{{ item.documentNumber ?? '—' }}
					</div>
					<div class="text-body-2 mb-2">
						{{ item.title }}
					</div>
					<div class="d-flex flex-wrap align-center ga-2 mb-1">
						<DocumentStatusChip :status="item.status" />
						<span class="text-caption text-medium-emphasis">
							{{ typeLabel(item.documentType) }}
							· v{{ item.documentVersion ?? '—' }}
						</span>
					</div>
					<div class="text-caption text-medium-emphasis">
						{{ item.publishedAt ? new Date(item.publishedAt).toLocaleString() : '—' }}
					</div>
				</v-card>
				<p
					v-if="items.length === 0"
					class="text-medium-emphasis text-center py-8"
				>
					No controlled documents in the library yet.
				</p>
			</div>

			<div class="d-none d-md-block table-scroll">
				<v-table>
					<thead>
						<tr>
							<th
								scope="col"
								class="table-scroll__sticky"
							>
								Number
							</th>
							<th scope="col">
								Title
							</th>
							<th scope="col">
								Type
							</th>
							<th scope="col">
								Version
							</th>
							<th scope="col">
								Status
							</th>
							<th scope="col">
								Published
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="item in items"
							:key="item.id"
							:class="{ 'library-row--clickable': isOpenable(item) }"
						>
							<td class="table-scroll__sticky font-weight-medium">
								<RouterLink
									v-if="isOpenable(item) && item.documentNumber"
									class="library-stretched-link"
									:to="{ name: 'library-document', params: { documentNumber: item.documentNumber } }"
								>
									{{ item.documentNumber }}
								</RouterLink>
								<template v-else>
									{{ item.documentNumber ?? '—' }}
								</template>
							</td>
							<td>{{ item.title }}</td>
							<td>{{ typeLabel(item.documentType) }}</td>
							<td>{{ item.documentVersion ?? '—' }}</td>
							<td>
								<DocumentStatusChip :status="item.status" />
							</td>
							<td class="text-body-2 text-medium-emphasis">
								{{ item.publishedAt ? new Date(item.publishedAt).toLocaleString() : '—' }}
							</td>
						</tr>
						<tr v-if="items.length === 0">
							<td colspan="6" class="text-medium-emphasis text-center py-8">
								No controlled documents in the library yet.
							</td>
						</tr>
					</tbody>
				</v-table>
			</div>
		</template>
	</div>
</template>

<style scoped>
.library-row--clickable,
.library-card--clickable {
	position: relative;
}

.library-row--clickable:hover,
.library-card--clickable:hover {
	background: rgba(var(--v-theme-on-surface), 0.04);
}

.library-stretched-link {
	color: inherit;
	font-weight: 600;
	text-decoration: none;
	outline-offset: 2px;
}

.library-stretched-link::after {
	content: '';
	position: absolute;
	inset: 0;
	z-index: 2;
}

.library-stretched-link:focus-visible {
	outline: none;
}

.library-stretched-link:focus-visible::after {
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
	min-width: 8rem;
}
</style>

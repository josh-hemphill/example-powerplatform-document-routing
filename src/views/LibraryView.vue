<script setup lang="ts">
import { useQuery } from '@pinia/colada';
import { computed, ref, watch } from 'vue';
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
		>
			{{ getApiErrorMessage(error, 'Failed to load library') }}
		</v-alert>

		<v-skeleton-loader v-if="isPending" type="table" />

		<v-table v-else hover>
			<thead>
				<tr>
					<th scope="col">
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
					class="library-row"
				>
					<td>
						<RouterLink
							v-if="item.documentNumber && item.status === 'published'"
							class="library-row__link"
							:to="{ name: 'library-document', params: { documentNumber: item.documentNumber } }"
						>
							{{ item.documentNumber }}
						</RouterLink>
						<span v-else>{{ item.documentNumber ?? '—' }}</span>
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

<style scoped>
.library-row__link {
	color: inherit;
	font-weight: 600;
	text-decoration: none;
}

.library-row__link:hover {
	text-decoration: underline;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery } from '@pinia/colada'
import { listDocumentsQuery } from '@/client/@pinia/colada.gen'
import DocumentStatusChip from '@/components/DocumentStatusChip.vue'
import type { DocumentStatus } from '@/domain/document-status'

const router = useRouter()
const statusFilter = ref<DocumentStatus | null>(null)
const search = ref('')

const queryInput = computed(() => ({
  query: {
    status: statusFilter.value ?? undefined,
    q: search.value.trim() || undefined,
  },
}))

const { data, isPending, error, refetch } = useQuery(() =>
  listDocumentsQuery(queryInput.value),
)

const items = computed(() => data.value?.items ?? [])
</script>

<template>
  <div>
    <v-row class="mb-2" dense>
      <v-col cols="12" md="6">
        <v-text-field
          v-model="search"
          label="Search requests"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
        />
      </v-col>
      <v-col cols="12" md="4">
        <v-select
          v-model="statusFilter"
          :items="[
            { title: 'All statuses', value: null },
            { title: 'Requested', value: 'requested' },
            { title: 'Drafting', value: 'drafting' },
            { title: 'In review', value: 'in_review' },
            { title: 'Approved', value: 'approved' },
            { title: 'Rejected', value: 'rejected' },
            { title: 'Published', value: 'published' },
          ]"
          label="Status"
          hide-details
        />
      </v-col>
      <v-col cols="12" md="2" class="d-flex">
        <v-btn class="flex-grow-1" variant="tonal" @click="() => refetch()">
          Refresh
        </v-btn>
      </v-col>
    </v-row>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error instanceof Error ? error.message : 'Failed to load documents' }}
    </v-alert>

    <v-skeleton-loader v-if="isPending" type="table" />

    <v-table v-else hover>
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Requester</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in items"
          :key="item.id"
          style="cursor: pointer"
          @click="router.push({ name: 'document', params: { documentId: item.id } })"
        >
          <td>
            <div class="font-weight-medium">{{ item.title }}</div>
            <div v-if="item.currentApproverEmail" class="text-caption text-medium-emphasis">
              Waiting on {{ item.currentApproverEmail }}
            </div>
          </td>
          <td>
            <DocumentStatusChip :status="item.status" />
          </td>
          <td>{{ item.requesterEmail }}</td>
          <td>{{ new Date(item.updatedAt).toLocaleString() }}</td>
        </tr>
        <tr v-if="items.length === 0">
          <td colspan="4" class="text-medium-emphasis py-8 text-center">
            No document requests yet. Create one to start routing.
          </td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>

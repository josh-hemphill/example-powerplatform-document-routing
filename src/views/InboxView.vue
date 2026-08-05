<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery } from '@pinia/colada'
import { listDocumentsQuery } from '@/client/@pinia/colada.gen'
import DocumentStatusChip from '@/components/DocumentStatusChip.vue'
import { getDocumentType, documentTypeSelectItems } from '@/config/document-types'
import {
  INBOX_PERSONAS,
  matchesInboxPersona,
  type InboxPersona,
} from '@/config/inbox-personas'
import type { DocumentStatus } from '@/domain/document-status'
import { usePowerAppsContext } from '@/composables/use-power-apps-context'

const router = useRouter()
const { context } = usePowerAppsContext()
const statusFilter = ref<DocumentStatus | null>(null)
const typeFilter = ref<string | null>(null)
const search = ref('')
const persona = ref<InboxPersona>('all')

const queryInput = computed(() => ({
  query: {
    status: statusFilter.value ?? undefined,
    documentType: typeFilter.value ?? undefined,
    q: search.value.trim() || undefined,
  },
}))

const { data, isPending, error, refetch } = useQuery(() =>
  listDocumentsQuery(queryInput.value),
)

const items = computed(() => {
  const list = data.value?.items ?? []
  return list.filter((item) =>
    matchesInboxPersona(item, persona.value, context.value.email),
  )
})

watch(
  [() => context.value.email, () => data.value?.items],
  ([email, items]) => {
    // Demo convenience: jump to "waiting on me" when signed in as an approver.
    if (
      email &&
      (items ?? []).some(
        (item) =>
          item.currentApproverEmail?.toLowerCase() === email.toLowerCase(),
      )
    ) {
      persona.value = 'waiting_on_me'
    }
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <v-chip-group v-model="persona" mandatory class="mb-3" selected-class="text-primary">
      <v-chip
        v-for="option in INBOX_PERSONAS"
        :key="option.value"
        :value="option.value"
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
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
        />
      </v-col>
      <v-col cols="12" md="3">
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
      <v-col cols="12" md="2">
        <v-select
          v-model="typeFilter"
          :items="[{ title: 'All types', value: null }, ...documentTypeSelectItems()]"
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

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error instanceof Error ? error.message : 'Failed to load documents' }}
    </v-alert>

    <v-skeleton-loader v-if="isPending" type="table" />

    <v-table v-else hover>
      <thead>
        <tr>
          <th>Title</th>
          <th>Type</th>
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
          <td>{{ getDocumentType(item.documentType).label }}</td>
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

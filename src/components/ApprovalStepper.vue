<script setup lang="ts">
defineProps<{
  steps: Array<{
    id: string
    order: number
    approverDisplayName: string
    approverEmail: string
    role?: string | null
    status: 'pending' | 'approved' | 'rejected' | 'skipped'
    comment?: string | null
  }>
}>()

const statusIcon: Record<string, string> = {
  pending: 'mdi-clock-outline',
  approved: 'mdi-check-circle',
  rejected: 'mdi-close-circle',
  skipped: 'mdi-minus-circle',
}

const statusColor: Record<string, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  skipped: 'default',
}
</script>

<template>
  <v-list lines="two" class="bg-transparent pa-0">
    <v-list-item
      v-for="step in steps"
      :key="step.id"
      class="px-0"
    >
      <template #prepend>
        <v-avatar :color="statusColor[step.status]" variant="tonal" size="36">
          <v-icon :icon="statusIcon[step.status]" size="20" />
        </v-avatar>
      </template>
      <v-list-item-title>
        Step {{ step.order }} · {{ step.approverDisplayName }}
      </v-list-item-title>
      <v-list-item-subtitle>
        {{ step.role || 'Approver' }} · {{ step.approverEmail }}
        <span v-if="step.comment"> · “{{ step.comment }}”</span>
      </v-list-item-subtitle>
    </v-list-item>
  </v-list>
</template>

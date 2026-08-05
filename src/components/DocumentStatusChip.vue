<script setup lang="ts">
import {
  DOCUMENT_STATUS_COLORS,
  DOCUMENT_STATUS_LABELS,
  type DocumentStatus,
} from '@/domain/document-status'

defineProps<{
  status: DocumentStatus
}>()
</script>

<template>
  <v-chip size="small" variant="tonal" :color="DOCUMENT_STATUS_COLORS[status]">
    {{ DOCUMENT_STATUS_LABELS[status] }}
  </v-chip>
</template>

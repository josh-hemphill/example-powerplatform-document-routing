<script setup lang="ts">
import { computed } from 'vue'
import {
  getWorkflowStageIndex,
  WORKFLOW_STAGES,
  DOCUMENT_STATUS_LABELS,
  type DocumentStatus,
} from '@/domain/document-status'

const props = defineProps<{
  status: DocumentStatus
}>()

const activeIndex = computed(() => getWorkflowStageIndex(props.status))
</script>

<template>
  <v-stepper :model-value="activeIndex + 1" alt-labels flat class="bg-transparent">
    <v-stepper-header>
      <template v-for="(stage, index) in WORKFLOW_STAGES" :key="stage">
        <v-stepper-item
          :value="index + 1"
          :title="DOCUMENT_STATUS_LABELS[stage]"
          :complete="index < activeIndex || status === 'published'"
          :color="status === 'rejected' && stage === 'in_review' ? 'error' : undefined"
        />
        <v-divider v-if="index < WORKFLOW_STAGES.length - 1" />
      </template>
    </v-stepper-header>
  </v-stepper>
</template>

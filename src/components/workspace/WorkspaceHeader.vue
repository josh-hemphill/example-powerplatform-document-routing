<script setup lang="ts">
import type { Document } from '@/client/types.gen';
import DocumentStatusChip from '@/components/DocumentStatusChip.vue';
import WorkflowTimeline from '@/components/WorkflowTimeline.vue';

defineProps<{
	document: Document;
	typeLabel: string;
}>();

const emit = defineEmits<{
	refresh: [];
}>();
</script>

<template>
	<v-card class="pa-4 mb-4">
		<div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-2">
			<div>
				<h1 class="text-h6 font-weight-bold">
					{{ document.title }}
				</h1>
				<div class="text-body-2 text-medium-emphasis">
					<template v-if="document.documentNumber">
						{{ document.documentNumber }}
						<template v-if="document.documentVersion">
							· v{{ document.documentVersion }}
						</template>
						·
					</template>
					{{ typeLabel }} · Requested by {{ document.requesterEmail }}
				</div>
			</div>
			<div class="d-flex align-center ga-2">
				<DocumentStatusChip :status="document.status" />
				<v-btn size="small" variant="tonal" @click="emit('refresh')">
					Refresh
				</v-btn>
			</div>
		</div>
		<WorkflowTimeline :status="document.status" />
	</v-card>
</template>

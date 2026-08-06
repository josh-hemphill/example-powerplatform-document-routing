<script setup lang="ts">
import type { HistoryEvent } from '@/client/types.gen';

defineProps<{
	history: HistoryEvent[];
	draftPreview: string;
}>();
</script>

<template>
	<div>
		<v-card class="pa-4 mb-4">
			<div class="text-subtitle-1 font-weight-bold mb-2">
				History
			</div>
			<v-timeline density="compact" side="end">
				<v-timeline-item
					v-for="event in history"
					:key="event.id"
					size="small"
					dot-color="primary"
				>
					<div class="text-caption text-medium-emphasis">
						{{ new Date(event.at).toLocaleString() }}
					</div>
					<div class="font-weight-medium">
						{{ event.action }}
					</div>
					<div class="text-body-2">
						{{ event.message }}
					</div>
					<div class="text-caption">
						{{ event.actorEmail }}
					</div>
				</v-timeline-item>
			</v-timeline>
		</v-card>

		<v-card class="pa-4">
			<div class="text-subtitle-1 font-weight-bold mb-2">
				Draft preview
			</div>
			<pre class="markdown-preview text-body-2 mb-0">{{ draftPreview || 'No draft yet.' }}</pre>
		</v-card>
	</div>
</template>

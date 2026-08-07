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
			<div
				id="history-heading"
				class="text-subtitle-1 font-weight-bold mb-2"
			>
				History
			</div>
			<p
				v-if="history.length === 0"
				class="text-body-2 text-medium-emphasis mb-0"
			>
				No history events yet. Saves, submits, and approval decisions will appear here.
			</p>
			<v-timeline
				v-else
				density="compact"
				side="end"
				aria-labelledby="history-heading"
			>
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

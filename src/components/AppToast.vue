<script setup lang="ts">
import { useToast } from '@/composables/use-toast';

const { visible, message, color, timeoutMs, dismiss } = useToast();
</script>

<template>
	<v-snackbar
		v-model="visible"
		:timeout="timeoutMs"
		:color="color"
		location="bottom"
		multi-line
		role="status"
		aria-live="polite"
	>
		{{ message }}
		<template #actions>
			<v-btn
				variant="text"
				@click="dismiss()"
			>
				Dismiss
			</v-btn>
		</template>
	</v-snackbar>
</template>

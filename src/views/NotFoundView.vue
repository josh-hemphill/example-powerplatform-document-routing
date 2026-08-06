<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
	<v-card class="pa-6 text-center">
		<div class="text-h5 font-weight-bold mb-2">
			Page not found
		</div>
		<p class="text-body-2 text-medium-emphasis mb-6">
			No route matches <code>{{ route.fullPath }}</code>.
		</p>
		<div class="d-flex justify-center flex-wrap ga-2">
			<v-btn color="primary" :to="{ name: 'inbox' }">
				Back to inbox
			</v-btn>
			<v-btn variant="tonal" :to="{ name: 'new-request' }">
				New request
			</v-btn>
		</div>
	</v-card>
</template>

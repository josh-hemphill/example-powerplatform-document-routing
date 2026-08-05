<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SetupBanner from '@/components/SetupBanner.vue';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { appConfig } from '@/config/app.config';
import {
	allowsDemoIdentityFallback,
	LOCAL_DEMO_PERSONAS,
	useIdentityStore,
} from '@/stores/identity';

const route = useRoute();
const router = useRouter();
const { context, isLoading, status, canAct } = usePowerAppsContext();
const identityStore = useIdentityStore();

const pageTitle = computed(() => String(route.meta.title ?? appConfig.brand.name));
const showPersonaSwitcher = computed(
	() => allowsDemoIdentityFallback() && status.value === 'standalone',
);
const hostChipLabel = computed(() => {
	if (status.value === 'hosted') {
		return 'Power Apps host';
	}
	if (status.value === 'standalone') {
		return 'Local play';
	}
	if (status.value === 'failed') {
		return 'Identity failed';
	}
	return 'Loading identity…';
});
</script>

<template>
	<v-app>
		<v-app-bar
			flat
			border
			color="surface"
			height="64"
		>
			<v-app-bar-title class="font-weight-bold text-primary">
				{{ appConfig.brand.name }}
			</v-app-bar-title>
			<v-spacer />
			<v-chip
				class="me-3"
				size="small"
				:color="status === 'hosted' ? 'success' : status === 'failed' ? 'error' : 'default'"
				variant="tonal"
			>
				{{ hostChipLabel }}
			</v-chip>
			<v-select
				v-if="showPersonaSwitcher"
				:model-value="context.email"
				:items="LOCAL_DEMO_PERSONAS"
				item-title="label"
				item-value="email"
				density="compact"
				hide-details
				label="Acting as"
				class="me-3"
				style="max-width: 220px"
				@update:model-value="identityStore.switchLocalPersona"
			/>
			<div
				v-else
				class="text-body-2 text-medium-emphasis me-4 d-none d-sm-block"
			>
				<template v-if="isLoading">
					Resolving user…
				</template>
				<template v-else>
					{{ context.userName }} · {{ context.email }}
				</template>
			</div>
			<v-btn
				color="primary"
				prepend-icon="$plus"
				:disabled="!canAct"
				@click="router.push({ name: 'new-request' })"
			>
				New request
			</v-btn>
		</v-app-bar>

		<v-main>
			<v-container class="py-6" style="max-width: 1100px">
				<SetupBanner />
				<div class="mb-4 d-flex align-center justify-space-between flex-wrap ga-2">
					<div>
						<h1 class="text-h5 font-weight-bold">
							{{ pageTitle }}
						</h1>
						<p class="text-body-2 text-medium-emphasis mb-0">
							{{ appConfig.brand.tagline }}
						</p>
					</div>
					<v-btn
						v-if="route.name !== 'inbox'"
						variant="text"
						prepend-icon="$arrowLeft"
						@click="router.push({ name: 'inbox' })"
					>
						Back to inbox
					</v-btn>
				</div>
				<slot />
			</v-container>
		</v-main>
	</v-app>
</template>

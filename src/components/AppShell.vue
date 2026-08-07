<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import AppToast from '@/components/AppToast.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import SetupBanner from '@/components/SetupBanner.vue';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { appConfig } from '@/config/app.config';
import {
	allowsDemoIdentityFallback,
	LOCAL_DEMO_PERSONAS,
	useIdentityStore,
} from '@/stores/identity';

interface ShellNavItem {
	name: string;
	title: string;
	icon: string;
	match: (routeName: string | symbol | null | undefined) => boolean;
	adminOnly?: boolean;
}

const route = useRoute();
const router = useRouter();
const { mdAndUp } = useDisplay();
const { context, isLoading, status, canAct } = usePowerAppsContext();
const identityStore = useIdentityStore();

const drawerOpen = ref(false);

const pageTitle = computed(() => String(route.meta.title ?? appConfig.brand.name));
const pageSubtitle = computed(() => {
	if (route.meta.hidePageHeading) {
		return null;
	}
	if (route.meta.subtitle === null) {
		return null;
	}
	if (typeof route.meta.subtitle === 'string') {
		return route.meta.subtitle;
	}
	return null;
});
const showPageHeading = computed(() => !route.meta.hidePageHeading);

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

const navItems = computed((): ShellNavItem[] => {
	const items: ShellNavItem[] = [
		{
			name: 'inbox',
			title: 'Inbox',
			icon: '$inboxOutline',
			match: (name) => name === 'inbox',
		},
		{
			name: 'library',
			title: 'Library',
			icon: '$bookOpenOutline',
			match: (name) => name === 'library' || name === 'library-document',
		},
		{
			name: 'admin',
			title: 'Admin',
			icon: '$cogOutline',
			match: (name) => name === 'admin',
			adminOnly: true,
		},
	];
	return items.filter((item) => !item.adminOnly || identityStore.hasRole('admin'));
});

function isNavActive(item: ShellNavItem): boolean {
	return item.match(route.name);
}

function goTo(name: string): void {
	drawerOpen.value = false;
	void router.push({ name });
}

watch(
	() => route.fullPath,
	() => {
		drawerOpen.value = false;
	},
);
</script>

<template>
	<v-app>
		<v-navigation-drawer
			v-if="!mdAndUp"
			v-model="drawerOpen"
			temporary
			location="start"
		>
			<div class="pa-4 text-subtitle-1 font-weight-bold text-primary">
				{{ appConfig.brand.name }}
			</div>
			<v-list nav>
				<v-list-item
					v-for="item in navItems"
					:key="item.name"
					:prepend-icon="item.icon"
					:title="item.title"
					:active="isNavActive(item)"
					:aria-current="isNavActive(item) ? 'page' : undefined"
					rounded="lg"
					@click="goTo(item.name)"
				/>
			</v-list>
			<div class="px-4 pt-2">
				<v-btn
					block
					color="primary"
					prepend-icon="$plus"
					:disabled="!canAct"
					@click="goTo('new-request')"
				>
					New request
				</v-btn>
			</div>
		</v-navigation-drawer>

		<v-app-bar
			flat
			border
			color="surface"
			height="64"
		>
			<v-app-bar-nav-icon
				v-if="!mdAndUp"
				aria-label="Open navigation"
				@click="drawerOpen = !drawerOpen"
			/>
			<v-app-bar-title class="font-weight-bold text-primary">
				{{ appConfig.brand.name }}
			</v-app-bar-title>
			<v-spacer />

			<template v-if="mdAndUp">
				<v-btn
					v-for="item in navItems"
					:key="item.name"
					class="me-1"
					:variant="isNavActive(item) ? 'flat' : 'text'"
					:color="isNavActive(item) ? 'primary' : undefined"
					:prepend-icon="item.icon"
					:aria-current="isNavActive(item) ? 'page' : undefined"
					@click="goTo(item.name)"
				>
					{{ item.title }}
				</v-btn>
			</template>

			<v-chip
				class="me-2 ms-1"
				size="small"
				:color="status === 'hosted' ? 'success' : status === 'failed' ? 'error' : 'default'"
				variant="tonal"
				:style="status === 'failed' ? 'cursor: pointer' : undefined"
				:title="status === 'failed' ? 'Retry identity load' : undefined"
				@click="status === 'failed' ? identityStore.retryLoad() : undefined"
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
				class="me-2 d-none d-sm-flex"
				style="max-width: 200px"
				@update:model-value="identityStore.switchLocalPersona"
			/>
			<div
				v-else
				class="text-body-2 text-medium-emphasis me-3 d-none d-md-block"
			>
				<template v-if="isLoading">
					Resolving user…
				</template>
				<template v-else>
					{{ context.userName }}
				</template>
			</div>
			<v-btn
				v-if="mdAndUp"
				color="primary"
				prepend-icon="$plus"
				:disabled="!canAct"
				@click="goTo('new-request')"
			>
				New request
			</v-btn>
			<v-btn
				v-else
				color="primary"
				icon="$plus"
				:disabled="!canAct"
				aria-label="New request"
				@click="goTo('new-request')"
			/>
		</v-app-bar>

		<v-main>
			<v-container class="py-6" style="max-width: 1100px">
				<SetupBanner />
				<div
					v-if="showPageHeading"
					class="mb-4"
				>
					<h1 class="text-h5 font-weight-bold">
						{{ pageTitle }}
					</h1>
					<p
						v-if="pageSubtitle"
						class="text-body-2 text-medium-emphasis mb-0"
					>
						{{ pageSubtitle }}
					</p>
				</div>
				<slot />
			</v-container>
		</v-main>

		<ConfirmDialog />
		<AppToast />
	</v-app>
</template>

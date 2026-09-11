<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import AppToast from '@/components/AppToast.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import SetupBanner from '@/components/SetupBanner.vue';
import { usePowerAppsContext } from '@/composables/use-power-apps-context';
import { appConfig } from '@/config/app.config';
import { demoPersonaSwitcherItems } from '@/config/local-personas';
import {
	allowsDemoIdentityFallback,
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
const { context, status, canAct } = usePowerAppsContext();
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

const showPersonaSwitcher = computed(() => allowsDemoIdentityFallback());
const personaSwitcherItems = computed(() =>
	demoPersonaSwitcherItems({
		email: identityStore.hostActor?.email,
		userName: identityStore.hostActor?.userName,
		roles: identityStore.hostActor?.roles,
	}),
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
		<a
			href="#main-content"
			class="skip-link"
		>
			Skip to content
		</a>
		<v-navigation-drawer
			v-if="!mdAndUp"
			v-model="drawerOpen"
			temporary
			location="start"
		>
			<div class="pa-4">
				<div class="d-flex align-center flex-wrap ga-2">
					<span class="text-subtitle-1 font-weight-bold text-primary">
						{{ appConfig.brand.name }}
					</span>
					<v-chip
						size="x-small"
						:color="status === 'hosted' ? 'success' : 'default'"
						variant="tonal"
					>
						{{ hostChipLabel }}
					</v-chip>
				</div>
				<p class="text-caption text-medium-emphasis mb-0 mt-1">
					{{ appConfig.brand.tagline }}
				</p>
			</div>
			<nav aria-label="Primary">
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
			</nav>
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
			<div
				v-if="showPersonaSwitcher"
				class="px-4 pt-3"
			>
				<v-select
					:model-value="context.email"
					:items="personaSwitcherItems"
					item-title="label"
					item-value="email"
					density="compact"
					hide-details
					label="Acting as"
					@update:model-value="identityStore.switchLocalPersona"
				/>
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
			<v-app-bar-title class="shell-brand-title">
				<div class="d-flex align-center flex-wrap ga-2">
					<v-tooltip
						:text="appConfig.brand.tagline"
						location="bottom"
					>
						<template #activator="{ props: tooltipProps }">
							<span
								v-bind="tooltipProps"
								class="font-weight-bold text-primary shell-brand-name"
							>
								{{ appConfig.brand.name }}
							</span>
						</template>
					</v-tooltip>
					<v-chip
						v-if="status !== 'failed'"
						size="x-small"
						:color="status === 'hosted' ? 'success' : 'default'"
						variant="tonal"
					>
						{{ hostChipLabel }}
					</v-chip>
				</div>
			</v-app-bar-title>
			<v-spacer />

			<nav
				v-if="mdAndUp"
				aria-label="Primary"
				class="d-flex align-center shell-nav"
			>
				<v-btn
					v-for="item in navItems"
					:key="item.name"
					class="me-1 shell-nav-btn"
					:variant="isNavActive(item) ? 'flat' : 'tonal'"
					color="primary"
					:prepend-icon="item.icon"
					:aria-current="isNavActive(item) ? 'page' : undefined"
					@click="goTo(item.name)"
				>
					{{ item.title }}
				</v-btn>
			</nav>

			<v-btn
				v-if="status === 'failed'"
				class="me-2 ms-2"
				size="small"
				color="error"
				variant="tonal"
				@click="identityStore.retryLoad()"
			>
				Retry sign-in
			</v-btn>
			<v-select
				v-if="showPersonaSwitcher"
				:model-value="context.email"
				:items="personaSwitcherItems"
				item-title="label"
				item-value="email"
				density="compact"
				hide-details
				label="Acting as"
				class="me-2 ms-2 d-none d-sm-flex"
				style="max-width: 220px"
				@update:model-value="identityStore.switchLocalPersona"
			/>
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
			<v-container
				id="main-content"
				class="py-6"
				style="max-width: 1100px"
				tabindex="-1"
			>
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

		<footer class="shell-footer text-caption text-medium-emphasis text-center py-3 d-md-none">
			{{ appConfig.brand.name }}
		</footer>

		<ConfirmDialog />
		<AppToast />
	</v-app>
</template>

<style scoped>
.skip-link {
	position: absolute;
	left: 0.75rem;
	top: -3rem;
	z-index: 3000;
	padding: 0.5rem 0.75rem;
	border-radius: 4px;
	background: rgb(var(--v-theme-primary));
	color: rgb(var(--v-theme-on-primary));
	text-decoration: none;
	font-weight: 600;
}

.skip-link:focus {
	top: 0.75rem;
	outline: 2px solid rgb(var(--v-theme-on-primary));
	outline-offset: 2px;
}

.shell-brand-title :deep(.v-toolbar-title__placeholder),
.shell-brand-title {
	overflow: hidden;
	flex: 0 1 auto;
	max-width: min(22rem, 40vw);
	min-width: 0;
}

.shell-brand-name {
	line-height: 1.2;
	white-space: nowrap;
	cursor: default;
}

.shell-nav-btn[aria-current='page'] {
	font-weight: 600;
}

.shell-footer {
	border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>

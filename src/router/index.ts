import { createRouter, createWebHashHistory } from 'vue-router';
import { useIdentityStore } from '@/stores/identity';

declare module 'vue-router' {
	interface RouteMeta {
		title?: string;
		/** Route-specific subtitle; null omits. */
		subtitle?: string | null;
		/** Skip shell H1 when the view owns the page title. */
		hidePageHeading?: boolean;
		requiresAdmin?: boolean;
	}
}

export const router = createRouter({
	// Hash history keeps deep links working inside the Power Apps host.
	history: createWebHashHistory(),
	routes: [
		{
			path: '/',
			name: 'inbox',
			component: async() => import('@/views/InboxView.vue'),
			meta: {
				title: 'Inbox',
				/** Persona helper text lives under the chip group — avoid stacked subtitles. */
				subtitle: null,
			},
		},
		{
			path: '/requests/new',
			name: 'new-request',
			component: async() => import('@/views/NewRequestView.vue'),
			meta: {
				title: 'New request',
				subtitle: null,
			},
		},
		{
			path: '/documents/:documentId',
			name: 'document',
			component: async() => import('@/views/DocumentWorkspaceView.vue'),
			meta: { hidePageHeading: true },
		},
		{
			path: '/admin',
			name: 'admin',
			component: async() => import('@/views/AdminView.vue'),
			meta: {
				title: 'Admin',
				subtitle: 'Document types, pools, destinations, and settings',
				requiresAdmin: true,
			},
		},
		{
			path: '/library',
			name: 'library',
			component: async() => import('@/views/LibraryView.vue'),
			meta: {
				title: 'Library',
				subtitle: 'Published controlled documents',
			},
		},
		{
			path: '/library/:documentNumber',
			name: 'library-document',
			component: async() => import('@/views/PublishedDocumentView.vue'),
			meta: { hidePageHeading: true },
		},
		{
			path: '/:pathMatch(.*)*',
			name: 'not-found',
			component: async() => import('@/views/NotFoundView.vue'),
			meta: {
				title: 'Not found',
				subtitle: null,
			},
		},
	],
});

router.beforeEach(async(to) => {
	if (!to.meta.requiresAdmin) {
		return true;
	}
	const identity = useIdentityStore();
	await identity.ensureLoaded();
	// Do not hard-redirect when hosted role lookup failed — Admin view shows retry.
	if (identity.rolesUnresolved) {
		return true;
	}
	if (!identity.hasRole('admin')) {
		return { name: 'inbox' };
	}
	return true;
});

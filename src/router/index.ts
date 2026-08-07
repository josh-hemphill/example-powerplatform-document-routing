import { createRouter, createWebHashHistory } from 'vue-router';
import { useIdentityStore } from '@/stores/identity';

declare module 'vue-router' {
	interface RouteMeta {
		title?: string;
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
			meta: { title: 'Inbox' },
		},
		{
			path: '/requests/new',
			name: 'new-request',
			component: async() => import('@/views/NewRequestView.vue'),
			meta: { title: 'New request' },
		},
		{
			path: '/documents/:documentId',
			name: 'document',
			component: async() => import('@/views/DocumentWorkspaceView.vue'),
			meta: { title: 'Document' },
		},
		{
			path: '/admin',
			name: 'admin',
			component: async() => import('@/views/AdminView.vue'),
			meta: { title: 'Admin', requiresAdmin: true },
		},
		{
			path: '/library',
			name: 'library',
			component: async() => import('@/views/LibraryView.vue'),
			meta: { title: 'Library' },
		},
		{
			path: '/library/:documentNumber',
			name: 'library-document',
			component: async() => import('@/views/PublishedDocumentView.vue'),
			meta: { title: 'Published document' },
		},
		{
			path: '/:pathMatch(.*)*',
			name: 'not-found',
			component: async() => import('@/views/NotFoundView.vue'),
			meta: { title: 'Not found' },
		},
	],
});

router.beforeEach(async(to) => {
	if (!to.meta.requiresAdmin) {
		return true;
	}
	const identity = useIdentityStore();
	await identity.ensureLoaded();
	if (!identity.hasRole('admin')) {
		return { name: 'inbox' };
	}
	return true;
});

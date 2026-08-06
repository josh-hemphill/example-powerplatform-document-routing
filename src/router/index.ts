import { createRouter, createWebHashHistory } from 'vue-router';

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
			meta: { title: 'Admin' },
		},
	],
});

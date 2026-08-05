import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  // Hash history keeps deep links working inside the Power Apps host.
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'inbox',
      component: () => import('@/views/InboxView.vue'),
      meta: { title: 'Inbox' },
    },
    {
      path: '/requests/new',
      name: 'new-request',
      component: () => import('@/views/NewRequestView.vue'),
      meta: { title: 'New request' },
    },
    {
      path: '/documents/:documentId',
      name: 'document',
      component: () => import('@/views/DocumentWorkspaceView.vue'),
      meta: { title: 'Document' },
    },
  ],
})

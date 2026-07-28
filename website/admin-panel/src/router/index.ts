/**
 * Vue Router 4 configuration with navigation guards.
 *
 * - All routes except /login require authentication
 * - Unauthenticated users are redirected to /login
 * - Already authenticated users accessing /login are redirected to /
 * - Authenticated routes use AdminLayout with sidebar navigation
 */

import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { isAuthenticated } from '@/api/client'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/layout/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
      },
      {
        path: 'providers',
        name: 'Providers',
        component: () => import('@/views/Providers.vue'),
      },
      {
        path: 'models',
        name: 'Models',
        component: () => import('@/views/Models.vue'),
      },
      {
        path: 'routing',
        name: 'Routing',
        component: () => import('@/views/Routing.vue'),
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/Users.vue'),
      },
      {
        path: 'billing',
        name: 'Billing',
        component: () => import('@/views/Billing.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Navigation guard: redirect to login when not authenticated
router.beforeEach((to, _from, next) => {
  const needsAuth = to.meta.requiresAuth !== false

  if (needsAuth && !isAuthenticated()) {
    next({ path: '/login', query: { redirect: to.fullPath } })
  } else if (to.path === '/login' && isAuthenticated()) {
    next({ path: '/' })
  } else {
    next()
  }
})

export default router

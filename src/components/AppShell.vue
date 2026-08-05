<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { appConfig } from '@/config/app.config'
import { usePowerAppsContext } from '@/composables/use-power-apps-context'
import SetupBanner from '@/components/SetupBanner.vue'

const route = useRoute()
const router = useRouter()
const { context } = usePowerAppsContext()

const pageTitle = computed(() => String(route.meta.title ?? appConfig.brand.name))
</script>

<template>
  <v-app>
    <v-app-bar flat border color="surface" height="64">
      <v-app-bar-title class="font-weight-bold text-primary">
        {{ appConfig.brand.name }}
      </v-app-bar-title>
      <v-spacer />
      <v-chip
        class="me-3"
        size="small"
        :color="context.isHosted ? 'success' : 'default'"
        variant="tonal"
      >
        {{ context.isHosted ? 'Power Apps host' : 'Local play' }}
      </v-chip>
      <div class="text-body-2 text-medium-emphasis me-4 d-none d-sm-block">
        {{ context.userName }}
      </div>
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
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
            <h1 class="text-h5 font-weight-bold">{{ pageTitle }}</h1>
            <p class="text-body-2 text-medium-emphasis mb-0">
              {{ appConfig.brand.tagline }}
            </p>
          </div>
          <v-btn
            v-if="route.name !== 'inbox'"
            variant="text"
            prepend-icon="mdi-arrow-left"
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

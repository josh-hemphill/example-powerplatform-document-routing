<script setup lang="ts">
import { appConfig, hasPlaceholderSharePointConfig } from '@/config/app.config'

const show = appConfig.features.showSetupBanner && hasPlaceholderSharePointConfig()
</script>

<template>
  <v-alert
    v-if="show"
    type="info"
    variant="tonal"
    class="mb-4"
    prominent
  >
    <div class="font-weight-bold mb-1">Customize before production use</div>
    <div class="text-body-2">
      Copy <code>deploy/connections.example.json</code> →
      <code>deploy/connections.json</code>, run <code>pnpm provision</code>, and set
      <code>VITE_SHAREPOINT_*</code> / brand in <code>src/config/app.config.ts</code>
      plus types in <code>document-types.ts</code>. Custom domains are supported —
      see <code>SETUP.md</code> and <code>deploy/README.md</code>.
    </div>
  </v-alert>
</template>

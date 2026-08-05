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
      Edit <code>src/config/app.config.ts</code> (SharePoint + brand) and
      <code>src/config/document-types.ts</code> (types + approval chains).
      See <code>SETUP.md</code> for the short adopter checklist.
    </div>
  </v-alert>
</template>

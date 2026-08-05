<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMutation, useQueryCache } from '@pinia/colada'
import {
  createDocumentRequestMutation,
  listDocumentsQueryKey,
} from '@/client/@pinia/colada.gen'
import { usePowerAppsContext } from '@/composables/use-power-apps-context'

const router = useRouter()
const queryCache = useQueryCache()
const { context } = usePowerAppsContext()
const formError = ref<string | null>(null)

const form = reactive({
  title: '',
  freeformRequest: '',
  requesterEmail: '',
  priority: 'normal' as 'low' | 'normal' | 'high',
  requestedPublishSiteUrl: 'https://contoso.sharepoint.com/sites/Policies',
  requestedLibraryName: 'Published Documents',
})

const { mutateAsync, isLoading } = useMutation({
  ...createDocumentRequestMutation(),
  async onSettled() {
    await queryCache.invalidateQueries({
      key: listDocumentsQueryKey(),
    })
  },
})

async function submit(): Promise<void> {
  formError.value = null
  const requesterEmail = form.requesterEmail || context.value.email || ''
  if (!form.title.trim() || form.freeformRequest.trim().length < 10 || !requesterEmail) {
    formError.value = 'Title, requester email, and a freeform request (10+ chars) are required.'
    return
  }

  try {
    const document = await mutateAsync({
      body: {
        title: form.title.trim(),
        freeformRequest: form.freeformRequest.trim(),
        requesterEmail,
        priority: form.priority,
        requestedPublishSiteUrl: form.requestedPublishSiteUrl,
        requestedLibraryName: form.requestedLibraryName,
      },
    })
    await router.push({ name: 'document', params: { documentId: document.id } })
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to create request'
  }
}
</script>

<template>
  <v-card class="pa-6">
    <p class="text-body-2 text-medium-emphasis mb-6">
      Capture an unstructured request. Authors will turn it into a draft, then route it
      through approvals before publishing a PDF to SharePoint.
    </p>

    <v-alert v-if="formError" type="error" variant="tonal" class="mb-4">
      {{ formError }}
    </v-alert>

    <v-form @submit.prevent="submit">
      <v-row>
        <v-col cols="12" md="8">
          <v-text-field v-model="form.title" label="Request title" required />
        </v-col>
        <v-col cols="12" md="4">
          <v-select
            v-model="form.priority"
            :items="[
              { title: 'Low', value: 'low' },
              { title: 'Normal', value: 'normal' },
              { title: 'High', value: 'high' },
            ]"
            label="Priority"
          />
        </v-col>
        <v-col cols="12">
          <v-textarea
            v-model="form.freeformRequest"
            label="Freeform request"
            rows="8"
            hint="Describe what the document should cover. No formatting required."
            persistent-hint
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="form.requesterEmail"
            :placeholder="context.email"
            label="Requester email"
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="form.requestedLibraryName"
            label="Target SharePoint library"
          />
        </v-col>
        <v-col cols="12">
          <v-text-field
            v-model="form.requestedPublishSiteUrl"
            label="Target SharePoint site URL"
          />
        </v-col>
      </v-row>

      <div class="d-flex justify-end ga-2 mt-2">
        <v-btn variant="text" :to="{ name: 'inbox' }">Cancel</v-btn>
        <v-btn color="primary" type="submit" :loading="isLoading">
          Submit request
        </v-btn>
      </div>
    </v-form>
  </v-card>
</template>

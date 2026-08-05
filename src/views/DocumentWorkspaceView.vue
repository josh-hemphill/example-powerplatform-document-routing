<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import {
  decideApprovalStepMutation,
  getDocumentQuery,
  getDocumentQueryKey,
  listDocumentsQueryKey,
  publishDocumentPdfMutation,
  submitForApprovalMutation,
  updateDocumentDraftMutation,
} from '@/client/@pinia/colada.gen'
import ApprovalStepper from '@/components/ApprovalStepper.vue'
import DocumentStatusChip from '@/components/DocumentStatusChip.vue'
import WorkflowTimeline from '@/components/WorkflowTimeline.vue'
import { usePowerAppsContext } from '@/composables/use-power-apps-context'
import { SharePointPublishService } from '@/generated/services/SharePointPublishService'

const route = useRoute()
const queryCache = useQueryCache()
const { context } = usePowerAppsContext()
const actionError = ref<string | null>(null)
const actionSuccess = ref<string | null>(null)

const documentId = computed(() => String(route.params.documentId))

const { data: document, isPending, error, refetch } = useQuery(() =>
  getDocumentQuery({
    path: { documentId: documentId.value },
  }),
)

const draftForm = reactive({
  title: '',
  bodyMarkdown: '',
  summary: '',
  authorEmail: '',
})

const approvalForm = reactive({
  comment: '',
  approversText:
    'Jordan Legal <jordan.legal@contoso.com> | Legal\nSam Compliance <sam.compliance@contoso.com> | Compliance',
})

const decisionForm = reactive({
  comment: '',
  actorEmail: '',
})

const publishForm = reactive({
  sharePointSiteUrl: '',
  libraryName: 'Published Documents',
  folderPath: '/Policies',
  fileName: '',
})

watch(
  document,
  (value) => {
    if (!value) {
      return
    }
    draftForm.title = value.title
    draftForm.bodyMarkdown =
      value.draftBodyMarkdown ??
      `# ${value.title}\n\n## Request\n${value.freeformRequest}\n\n## Draft\n`
    draftForm.summary = value.draftSummary ?? ''
    draftForm.authorEmail = value.authorEmail ?? context.value.email ?? ''
    publishForm.sharePointSiteUrl =
      value.requestedPublishSiteUrl ?? 'https://contoso.sharepoint.com/sites/Policies'
    publishForm.libraryName = value.requestedLibraryName ?? 'Published Documents'
    decisionForm.actorEmail =
      value.currentApproverEmail ?? context.value.email ?? ''
  },
  { immediate: true },
)

async function invalidateDocumentQueries(): Promise<void> {
  await Promise.all([
    queryCache.invalidateQueries({ key: getDocumentQueryKey({ path: { documentId: documentId.value } }) }),
    queryCache.invalidateQueries({ key: listDocumentsQueryKey() }),
  ])
}

const {
  mutateAsync: saveDraftAsync,
  isLoading: isSavingDraft,
} = useMutation({
  ...updateDocumentDraftMutation(),
  async onSettled() {
    await invalidateDocumentQueries()
  },
})

const {
  mutateAsync: submitApprovalAsync,
  isLoading: isSubmittingApproval,
} = useMutation({
  ...submitForApprovalMutation(),
  async onSettled() {
    await invalidateDocumentQueries()
  },
})

const {
  mutateAsync: decideStepAsync,
  isLoading: isDecidingStep,
} = useMutation({
  ...decideApprovalStepMutation(),
  async onSettled() {
    await invalidateDocumentQueries()
  },
})

const {
  mutateAsync: publishPdfAsync,
  isLoading: isPublishingPdf,
} = useMutation({
  ...publishDocumentPdfMutation(),
  async onSettled() {
    await invalidateDocumentQueries()
  },
})

function parseApprovers(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s*<([^>]+)>(?:\s*\|\s*(.+))?$/)
      if (!match) {
        throw new Error(
          `Approver line must look like: Name <email@contoso.com> | Role\nGot: ${line}`,
        )
      }
      return {
        displayName: match[1]!.trim(),
        email: match[2]!.trim(),
        role: match[3]?.trim(),
      }
    })
}

async function onSaveDraft(): Promise<void> {
  actionError.value = null
  actionSuccess.value = null
  try {
    await saveDraftAsync({
      path: { documentId: documentId.value },
      body: {
        title: draftForm.title,
        bodyMarkdown: draftForm.bodyMarkdown,
        authorEmail: draftForm.authorEmail || context.value.email || 'author@contoso.com',
        summary: draftForm.summary || undefined,
      },
    })
    actionSuccess.value = 'Draft saved. Ready for the approval chain when content is complete.'
  } catch (saveError) {
    actionError.value = saveError instanceof Error ? saveError.message : 'Failed to save draft'
  }
}

async function onSubmitForApproval(): Promise<void> {
  actionError.value = null
  actionSuccess.value = null
  try {
    const approvers = parseApprovers(approvalForm.approversText)
    await submitApprovalAsync({
      path: { documentId: documentId.value },
      body: {
        approvers,
        comment: approvalForm.comment || undefined,
      },
    })
    actionSuccess.value = 'Submitted to the approval chain.'
  } catch (submitError) {
    actionError.value =
      submitError instanceof Error ? submitError.message : 'Failed to submit for approval'
  }
}

async function onDecision(decision: 'approve' | 'reject'): Promise<void> {
  actionError.value = null
  actionSuccess.value = null
  const step = document.value?.approvalSteps.find((item) => item.status === 'pending')
  if (!step) {
    actionError.value = 'No pending approval step.'
    return
  }

  try {
    await decideStepAsync({
      path: {
        documentId: documentId.value,
        stepId: step.id,
      },
      body: {
        decision,
        actorEmail: decisionForm.actorEmail || step.approverEmail,
        comment: decisionForm.comment || undefined,
      },
    })
    actionSuccess.value =
      decision === 'approve' ? 'Approval recorded.' : 'Document rejected.'
  } catch (decisionError) {
    actionError.value =
      decisionError instanceof Error ? decisionError.message : 'Failed to record decision'
  }
}

async function onPublish(): Promise<void> {
  actionError.value = null
  actionSuccess.value = null
  try {
    // Demonstrates the SharePoint connector stub used alongside the OpenAPI publish API.
    // In Power Platform, replace the stub with the generated SharePoint service or a flow.
    const previewUpload = await SharePointPublishService.createFile({
      siteUrl: publishForm.sharePointSiteUrl,
      libraryName: publishForm.libraryName,
      folderPath: publishForm.folderPath,
      fileName: publishForm.fileName || `${draftForm.title || 'document'}.pdf`,
      contentBase64: btoa(unescape(encodeURIComponent(draftForm.bodyMarkdown || document.value?.freeformRequest || ''))),
      contentType: 'application/pdf',
    })

    const result = await publishPdfAsync({
      path: { documentId: documentId.value },
      body: {
        sharePointSiteUrl: publishForm.sharePointSiteUrl,
        libraryName: publishForm.libraryName,
        folderPath: publishForm.folderPath,
        fileName: publishForm.fileName || undefined,
      },
    })

    actionSuccess.value = `Published to SharePoint: ${result.sharePointUrl} (connector preview item ${previewUpload.itemId})`
  } catch (publishError) {
    actionError.value =
      publishError instanceof Error ? publishError.message : 'Failed to publish PDF'
  }
}

const pendingStep = computed(() =>
  document.value?.approvalSteps.find((step) => step.status === 'pending') ?? null,
)

const canDraft = computed(
  () =>
    document.value &&
    ['requested', 'drafting', 'in_review', 'approved'].includes(document.value.status),
)

const canSubmitApproval = computed(() => document.value?.status === 'drafting')
const canDecide = computed(() => document.value?.status === 'in_review' && pendingStep.value)
const canPublish = computed(() => document.value?.status === 'approved')
</script>

<template>
  <div>
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error instanceof Error ? error.message : 'Failed to load document' }}
    </v-alert>
    <v-alert v-if="actionError" type="error" variant="tonal" class="mb-4">
      {{ actionError }}
    </v-alert>
    <v-alert v-if="actionSuccess" type="success" variant="tonal" class="mb-4">
      {{ actionSuccess }}
    </v-alert>

    <v-skeleton-loader v-if="isPending" type="article, actions" />

    <template v-else-if="document">
      <v-card class="pa-4 mb-4">
        <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-2">
          <div>
            <div class="text-h6 font-weight-bold">{{ document.title }}</div>
            <div class="text-body-2 text-medium-emphasis">
              Requested by {{ document.requesterEmail }}
            </div>
          </div>
          <div class="d-flex align-center ga-2">
            <DocumentStatusChip :status="document.status" />
            <v-btn size="small" variant="tonal" @click="() => refetch()">Refresh</v-btn>
          </div>
        </div>
        <WorkflowTimeline :status="document.status" />
      </v-card>

      <v-row>
        <v-col cols="12" md="7">
          <v-card class="pa-4 mb-4">
            <div class="text-subtitle-1 font-weight-bold mb-2">1. Freeform request</div>
            <p class="markdown-preview mb-0">{{ document.freeformRequest }}</p>
          </v-card>

          <v-card class="pa-4 mb-4">
            <div class="text-subtitle-1 font-weight-bold mb-3">2. Author / draft</div>
            <v-text-field v-model="draftForm.title" label="Document title" class="mb-2" />
            <v-text-field v-model="draftForm.authorEmail" label="Author email" class="mb-2" />
            <v-text-field v-model="draftForm.summary" label="Short summary" class="mb-2" />
            <v-textarea
              v-model="draftForm.bodyMarkdown"
              label="Draft (Markdown)"
              rows="12"
              class="mb-3"
            />
            <v-btn
              color="secondary"
              :disabled="!canDraft"
              :loading="isSavingDraft"
              @click="onSaveDraft"
            >
              Save draft
            </v-btn>
          </v-card>

          <v-card class="pa-4 mb-4">
            <div class="text-subtitle-1 font-weight-bold mb-3">3. Approval chain</div>
            <template v-if="document.approvalSteps.length === 0">
              <v-textarea
                v-model="approvalForm.approversText"
                label="Approvers (one per line)"
                rows="4"
                hint="Format: Name <email@contoso.com> | Role"
                persistent-hint
                class="mb-2"
              />
              <v-text-field v-model="approvalForm.comment" label="Submission comment" class="mb-3" />
              <v-btn
                color="warning"
                :disabled="!canSubmitApproval"
                :loading="isSubmittingApproval"
                @click="onSubmitForApproval"
              >
                Submit for approval
              </v-btn>
            </template>
            <template v-else>
              <ApprovalStepper :steps="document.approvalSteps" />
              <div v-if="canDecide" class="mt-4">
                <v-text-field
                  v-model="decisionForm.actorEmail"
                  label="Acting as"
                  class="mb-2"
                />
                <v-text-field v-model="decisionForm.comment" label="Decision comment" class="mb-3" />
                <div class="d-flex ga-2">
                  <v-btn
                    color="success"
                    :loading="isDecidingStep"
                    @click="onDecision('approve')"
                  >
                    Approve step
                  </v-btn>
                  <v-btn
                    color="error"
                    variant="tonal"
                    :loading="isDecidingStep"
                    @click="onDecision('reject')"
                  >
                    Reject
                  </v-btn>
                </div>
              </div>
            </template>
          </v-card>

          <v-card class="pa-4">
            <div class="text-subtitle-1 font-weight-bold mb-3">4. Publish PDF to SharePoint</div>
            <v-text-field
              v-model="publishForm.sharePointSiteUrl"
              label="SharePoint site URL"
              class="mb-2"
            />
            <v-text-field v-model="publishForm.libraryName" label="Library name" class="mb-2" />
            <v-text-field v-model="publishForm.folderPath" label="Folder path" class="mb-2" />
            <v-text-field
              v-model="publishForm.fileName"
              label="PDF file name (optional)"
              class="mb-3"
            />
            <v-btn
              color="primary"
              :disabled="!canPublish"
              :loading="isPublishingPdf"
              @click="onPublish"
            >
              Publish PDF
            </v-btn>
            <div v-if="document.publishedPdfUrl" class="mt-3">
              <a :href="document.publishedPdfUrl" target="_blank" rel="noreferrer">
                {{ document.publishedPdfUrl }}
              </a>
            </div>
          </v-card>
        </v-col>

        <v-col cols="12" md="5">
          <v-card class="pa-4 mb-4">
            <div class="text-subtitle-1 font-weight-bold mb-2">History</div>
            <v-timeline density="compact" side="end">
              <v-timeline-item
                v-for="event in document.history"
                :key="event.id"
                size="small"
                dot-color="primary"
              >
                <div class="text-caption text-medium-emphasis">
                  {{ new Date(event.at).toLocaleString() }}
                </div>
                <div class="font-weight-medium">{{ event.action }}</div>
                <div class="text-body-2">{{ event.message }}</div>
                <div class="text-caption">{{ event.actorEmail }}</div>
              </v-timeline-item>
            </v-timeline>
          </v-card>

          <v-card class="pa-4">
            <div class="text-subtitle-1 font-weight-bold mb-2">Draft preview</div>
            <pre class="markdown-preview text-body-2 mb-0">{{ draftForm.bodyMarkdown || 'No draft yet.' }}</pre>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>

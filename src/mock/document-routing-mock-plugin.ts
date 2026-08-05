import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { appConfig } from '../config/app.config.ts'
import { buildSharePointDocumentUrl } from '../publishing/sharepoint-paths.ts'
import {
  activateStep,
  claimStep,
  createStepFromInput,
  processStepSla,
  releaseStep,
  syncCurrentApprovalFields,
} from './approval-engine.ts'
import {
  createSeedDocuments,
  type MockDocumentRecord,
} from './seed-documents.ts'

const store = new Map<string, MockDocumentRecord>()

const stamp = (): string => new Date().toISOString()

const seed = (): void => {
  if (store.size > 0) {
    return
  }
  for (const document of createSeedDocuments()) {
    store.set(document.id, document)
  }
}

const readJson = async <T>(req: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw.length === 0 ? ({} as T) : (JSON.parse(raw) as T)
}

const sendJson = (
  res: ServerResponse,
  status: number,
  body: unknown,
): void => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

const toSummary = (document: MockDocumentRecord) => ({
  id: document.id,
  title: document.title,
  documentType: document.documentType,
  status: document.status,
  requesterEmail: document.requesterEmail,
  priority: document.priority,
  currentApproverEmail: document.currentApproverEmail,
  currentStepStatus: document.currentStepStatus,
  currentStepDueAt: document.currentStepDueAt,
  currentStepElevated: document.currentStepElevated,
  currentPoolEmails: document.currentPoolEmails,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
})

const pushHistory = (
  document: MockDocumentRecord,
  actorEmail: string,
  action: string,
  message: string,
): void => {
  document.history.unshift({
    id: randomUUID(),
    at: stamp(),
    actorEmail,
    action,
    message,
  })
  document.updatedAt = stamp()
}

const matchRoute = (
  url: string,
  pattern: RegExp,
): RegExpMatchArray | null => url.match(pattern)

const activeStep = (document: MockDocumentRecord) =>
  document.approvalSteps.find(
    (step) => step.status === 'queued' || step.status === 'pending',
  )

/**
 * Serves an in-memory Document Routing API so the Code App is runnable offline.
 */
export function documentRoutingMockPlugin(): Plugin {
  seed()

  return {
    name: 'document-routing-mock',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api')) {
          next()
          return
        }

        try {
          const url = new URL(req.url, 'http://localhost')
          const path = url.pathname
          const method = req.method ?? 'GET'

          if (method === 'GET' && path === '/api/documents') {
            const status = url.searchParams.get('status')
            const documentType = url.searchParams.get('documentType')
            const q = url.searchParams.get('q')?.toLowerCase()
            let items = [...store.values()].map(toSummary)

            if (status) {
              items = items.filter((item) => item.status === status)
            }
            if (documentType) {
              items = items.filter((item) => item.documentType === documentType)
            }
            if (q) {
              items = items.filter((item) => {
                const full = store.get(item.id)
                return (
                  item.title.toLowerCase().includes(q) ||
                  Boolean(full?.freeformRequest.toLowerCase().includes(q))
                )
              })
            }

            items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            sendJson(res, 200, { items })
            return
          }

          if (method === 'POST' && path === '/api/documents') {
            const body = await readJson<{
              title: string
              documentType: string
              freeformRequest: string
              requesterEmail: string
              priority?: 'low' | 'normal' | 'high'
              requestedPublishSiteUrl?: string
              requestedLibraryName?: string
            }>(req)

            const id = randomUUID()
            const createdAt = stamp()
            const document: MockDocumentRecord = {
              id,
              title: body.title,
              documentType: body.documentType,
              status: 'requested',
              requesterEmail: body.requesterEmail,
              priority: body.priority ?? 'normal',
              currentApproverEmail: null,
              currentStepStatus: null,
              currentStepDueAt: null,
              currentStepElevated: null,
              currentPoolEmails: [],
              createdAt,
              updatedAt: createdAt,
              freeformRequest: body.freeformRequest,
              draftBodyMarkdown: null,
              draftSummary: null,
              authorEmail: null,
              approvalSteps: [],
              history: [],
              publishedPdfUrl: null,
              sharePointItemId: null,
              requestedPublishSiteUrl:
                body.requestedPublishSiteUrl ?? appConfig.sharePoint.siteUrl,
              requestedLibraryName:
                body.requestedLibraryName ?? appConfig.sharePoint.libraryName,
            }
            pushHistory(
              document,
              body.requesterEmail,
              'requested',
              'Freeform request submitted',
            )
            store.set(id, document)
            sendJson(res, 201, document)
            return
          }

          const documentMatch = matchRoute(path, /^\/api\/documents\/([^/]+)$/)
          if (method === 'GET' && documentMatch) {
            const document = store.get(documentMatch[1]!)
            if (!document) {
              sendJson(res, 404, { message: 'Document not found', code: 'not_found' })
              return
            }
            sendJson(res, 200, document)
            return
          }

          const draftMatch = matchRoute(path, /^\/api\/documents\/([^/]+)\/draft$/)
          if (method === 'PUT' && draftMatch) {
            const document = store.get(draftMatch[1]!)
            if (!document) {
              sendJson(res, 404, { message: 'Document not found', code: 'not_found' })
              return
            }
            if (document.status === 'published' || document.status === 'rejected') {
              sendJson(res, 409, {
                message: `Cannot draft a document in status ${document.status}`,
                code: 'invalid_state',
              })
              return
            }

            const body = await readJson<{
              title: string
              bodyMarkdown: string
              authorEmail: string
              summary?: string
            }>(req)

            document.title = body.title
            document.draftBodyMarkdown = body.bodyMarkdown
            document.draftSummary = body.summary ?? null
            document.authorEmail = body.authorEmail
            document.status = 'drafting'
            pushHistory(
              document,
              body.authorEmail,
              'draft_updated',
              'Draft content saved',
            )
            sendJson(res, 200, document)
            return
          }

          const submitMatch = matchRoute(
            path,
            /^\/api\/documents\/([^/]+)\/submit-for-approval$/,
          )
          if (method === 'POST' && submitMatch) {
            const document = store.get(submitMatch[1]!)
            if (!document) {
              sendJson(res, 404, { message: 'Document not found', code: 'not_found' })
              return
            }
            if (document.status !== 'drafting' || !document.draftBodyMarkdown) {
              sendJson(res, 409, {
                message: 'Document must be drafted before approval',
                code: 'invalid_state',
              })
              return
            }

            const body = await readJson<{
              steps: Array<{
                assignmentMode: 'named' | 'pool'
                role?: string
                slaHours?: number
                assignee?: { email: string; displayName: string; role?: string }
                pool?: Array<{ email: string; displayName: string; role?: string }>
                elevationPool?: Array<{
                  email: string
                  displayName: string
                  role?: string
                }>
              }>
              comment?: string
            }>(req)

            const clock = new Date()
            document.approvalSteps = body.steps.map((step, index) =>
              createStepFromInput(step, index + 1, clock, index === 0),
            )
            document.status = 'in_review'
            syncCurrentApprovalFields(document)
            pushHistory(
              document,
              document.authorEmail ?? document.requesterEmail,
              'submitted_for_approval',
              body.comment ?? 'Submitted to approval chain',
            )
            sendJson(res, 200, document)
            return
          }

          const slaMatch = matchRoute(
            path,
            /^\/api\/documents\/([^/]+)\/approvals\/process-sla$/,
          )
          if (method === 'POST' && slaMatch) {
            const document = store.get(slaMatch[1]!)
            if (!document) {
              sendJson(res, 404, { message: 'Document not found', code: 'not_found' })
              return
            }
            const body = await readJson<{ now?: string }>(req)
            const clock = body.now ? new Date(body.now) : new Date()
            const step = activeStep(document)
            if (step) {
              const result = processStepSla(step, clock)
              if (result.changed && result.message) {
                pushHistory(
                  document,
                  'system@sla-processor',
                  'sla_elevated',
                  result.message,
                )
              }
            }
            syncCurrentApprovalFields(document)
            sendJson(res, 200, document)
            return
          }

          const claimMatch = matchRoute(
            path,
            /^\/api\/documents\/([^/]+)\/approvals\/([^/]+)\/claim$/,
          )
          if (method === 'POST' && claimMatch) {
            const document = store.get(claimMatch[1]!)
            if (!document) {
              sendJson(res, 404, { message: 'Document not found', code: 'not_found' })
              return
            }
            const step = document.approvalSteps.find((item) => item.id === claimMatch[2])
            if (!step) {
              sendJson(res, 404, { message: 'Approval step not found', code: 'not_found' })
              return
            }
            const active = activeStep(document)
            if (!active || active.id !== step.id) {
              sendJson(res, 409, {
                message: 'Only the current active step can be claimed',
                code: 'invalid_state',
              })
              return
            }
            const body = await readJson<{ actorEmail: string; comment?: string }>(req)
            try {
              claimStep(step, body.actorEmail, new Date())
            } catch (error) {
              const code =
                error instanceof Error && 'code' in error
                  ? String((error as { code: string }).code)
                  : 'invalid_state'
              sendJson(res, 409, {
                message: error instanceof Error ? error.message : 'Claim failed',
                code,
              })
              return
            }
            syncCurrentApprovalFields(document)
            pushHistory(
              document,
              body.actorEmail,
              'claimed',
              body.comment ?? `Claimed step ${step.order}`,
            )
            sendJson(res, 200, document)
            return
          }

          const releaseMatch = matchRoute(
            path,
            /^\/api\/documents\/([^/]+)\/approvals\/([^/]+)\/release$/,
          )
          if (method === 'POST' && releaseMatch) {
            const document = store.get(releaseMatch[1]!)
            if (!document) {
              sendJson(res, 404, { message: 'Document not found', code: 'not_found' })
              return
            }
            const step = document.approvalSteps.find(
              (item) => item.id === releaseMatch[2],
            )
            if (!step) {
              sendJson(res, 404, { message: 'Approval step not found', code: 'not_found' })
              return
            }
            const body = await readJson<{ actorEmail: string; comment?: string }>(req)
            try {
              releaseStep(step, body.actorEmail)
            } catch (error) {
              sendJson(res, 409, {
                message: error instanceof Error ? error.message : 'Release failed',
                code: 'invalid_state',
              })
              return
            }
            syncCurrentApprovalFields(document)
            pushHistory(
              document,
              body.actorEmail,
              'released',
              body.comment ?? `Released step ${step.order} back to queue`,
            )
            sendJson(res, 200, document)
            return
          }

          const decisionMatch = matchRoute(
            path,
            /^\/api\/documents\/([^/]+)\/approvals\/([^/]+)\/decision$/,
          )
          if (method === 'POST' && decisionMatch) {
            const document = store.get(decisionMatch[1]!)
            if (!document) {
              sendJson(res, 404, { message: 'Document not found', code: 'not_found' })
              return
            }
            if (document.status !== 'in_review') {
              sendJson(res, 409, {
                message: 'Document is not awaiting approval',
                code: 'invalid_state',
              })
              return
            }

            const step = document.approvalSteps.find(
              (item) => item.id === decisionMatch[2],
            )
            if (!step) {
              sendJson(res, 404, {
                message: 'Approval step not found',
                code: 'not_found',
              })
              return
            }

            const active = activeStep(document)
            if (!active || active.id !== step.id || step.status !== 'pending') {
              sendJson(res, 409, {
                message: 'Only a claimed/named pending step can be decided',
                code: 'invalid_state',
              })
              return
            }

            const body = await readJson<{
              decision: 'approve' | 'reject'
              actorEmail: string
              comment?: string
            }>(req)

            step.comment = body.comment ?? null
            step.decidedAt = stamp()

            if (body.decision === 'reject') {
              step.status = 'rejected'
              document.status = 'rejected'
              syncCurrentApprovalFields(document)
              pushHistory(
                document,
                body.actorEmail,
                'rejected',
                body.comment ?? 'Rejected in approval chain',
              )
              sendJson(res, 200, document)
              return
            }

            step.status = 'approved'
            const next = document.approvalSteps.find(
              (item) => item.order === step.order + 1,
            )
            if (next) {
              activateStep(next, new Date())
              pushHistory(
                document,
                body.actorEmail,
                'step_approved',
                body.comment ?? `Approved step ${step.order}`,
              )
            } else {
              document.status = 'approved'
              pushHistory(
                document,
                body.actorEmail,
                'fully_approved',
                body.comment ?? 'All approval steps completed',
              )
            }

            syncCurrentApprovalFields(document)
            sendJson(res, 200, document)
            return
          }

          const publishMatch = matchRoute(
            path,
            /^\/api\/documents\/([^/]+)\/publish$/,
          )
          if (method === 'POST' && publishMatch) {
            const document = store.get(publishMatch[1]!)
            if (!document) {
              sendJson(res, 404, { message: 'Document not found', code: 'not_found' })
              return
            }
            if (document.status !== 'approved' && document.status !== 'published') {
              sendJson(res, 409, {
                message: 'Only approved documents can be published',
                code: 'invalid_state',
              })
              return
            }

            const body = await readJson<{
              sharePointSiteUrl: string
              libraryName: string
              folderPath?: string
              fileName?: string
            }>(req)

            const pdfFileName =
              body.fileName ??
              `${document.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`
            const sharePointItemId = randomUUID()
            const sharePointUrl = buildSharePointDocumentUrl({
              siteUrl: body.sharePointSiteUrl,
              libraryName: body.libraryName,
              folderPath: body.folderPath,
              fileName: pdfFileName,
            })

            document.status = 'published'
            document.publishedPdfUrl = sharePointUrl
            document.sharePointItemId = sharePointItemId
            document.requestedPublishSiteUrl = body.sharePointSiteUrl
            document.requestedLibraryName = body.libraryName
            pushHistory(
              document,
              document.authorEmail ?? document.requesterEmail,
              'published',
              `Published PDF to ${body.libraryName}`,
            )

            sendJson(res, 200, {
              document,
              pdfFileName,
              sharePointUrl,
              sharePointItemId,
              publishedAt: stamp(),
            })
            return
          }

          sendJson(res, 404, { message: `No mock route for ${method} ${path}` })
        } catch (error) {
          sendJson(res, 500, {
            message: error instanceof Error ? error.message : 'Mock API failure',
            code: 'mock_error',
          })
        }
      })
    },
  }
}

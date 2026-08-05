import { randomUUID } from 'node:crypto'
import { appConfig } from '../config/app.config.ts'
import { getDocumentType } from '../config/document-types.ts'

export type MockDocumentStatus =
  | 'requested'
  | 'drafting'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'published'

export interface MockDocumentRecord {
  id: string
  title: string
  documentType: string
  status: MockDocumentStatus
  requesterEmail: string
  priority: 'low' | 'normal' | 'high'
  currentApproverEmail: string | null
  createdAt: string
  updatedAt: string
  freeformRequest: string
  draftBodyMarkdown: string | null
  draftSummary: string | null
  authorEmail: string | null
  approvalSteps: Array<{
    id: string
    order: number
    approverEmail: string
    approverDisplayName: string
    role: string | null
    status: 'pending' | 'approved' | 'rejected' | 'skipped'
    comment: string | null
    decidedAt: string | null
  }>
  history: Array<{
    id: string
    at: string
    actorEmail: string
    action: string
    message: string
  }>
  publishedPdfUrl: string | null
  sharePointItemId: string | null
  requestedPublishSiteUrl: string | null
  requestedLibraryName: string | null
}

const now = (): string => new Date().toISOString()

/**
 * Seeds demo documents across types and workflow stages for local play.
 */
export function createSeedDocuments(): MockDocumentRecord[] {
  const createdAt = now()
  const policy = getDocumentType('policy')
  const sop = getDocumentType('sop')

  const requestedId = randomUUID()
  const draftingId = randomUUID()
  const inReviewId = randomUUID()

  return [
    {
      id: requestedId,
      title: 'Q3 Travel Policy Update',
      documentType: policy.id,
      status: 'requested',
      requesterEmail: 'alex.requester@contoso.com',
      priority: 'high',
      currentApproverEmail: null,
      createdAt,
      updatedAt: createdAt,
      freeformRequest:
        'Please draft an updated travel policy covering economy class defaults, manager pre-approval above $1,500, and green travel options for trips under 4 hours.',
      draftBodyMarkdown: null,
      draftSummary: null,
      authorEmail: null,
      approvalSteps: [],
      history: [
        {
          id: randomUUID(),
          at: createdAt,
          actorEmail: 'alex.requester@contoso.com',
          action: 'requested',
          message: 'Freeform request submitted',
        },
      ],
      publishedPdfUrl: null,
      sharePointItemId: null,
      requestedPublishSiteUrl: appConfig.sharePoint.siteUrl,
      requestedLibraryName: appConfig.sharePoint.libraryName,
    },
    {
      id: draftingId,
      title: 'Laptop Refresh SOP',
      documentType: sop.id,
      status: 'drafting',
      requesterEmail: 'pat.manager@contoso.com',
      priority: 'normal',
      currentApproverEmail: null,
      createdAt,
      updatedAt: createdAt,
      freeformRequest:
        'Document the 36-month laptop refresh process for corporate devices, including inventory checks and return shipping.',
      draftBodyMarkdown: `# Laptop Refresh SOP

## Overview
Document the 36-month laptop refresh process for corporate devices.

## Procedure
1. Confirm asset age in Intune
2. Order replacement
3. Image and ship
`,
      draftSummary: 'Corporate laptop refresh procedure',
      authorEmail: appConfig.localDemoUser.email,
      approvalSteps: [],
      history: [
        {
          id: randomUUID(),
          at: createdAt,
          actorEmail: 'pat.manager@contoso.com',
          action: 'requested',
          message: 'Freeform request submitted',
        },
        {
          id: randomUUID(),
          at: createdAt,
          actorEmail: appConfig.localDemoUser.email,
          action: 'draft_updated',
          message: 'Draft content saved',
        },
      ],
      publishedPdfUrl: null,
      sharePointItemId: null,
      requestedPublishSiteUrl: appConfig.sharePoint.siteUrl,
      requestedLibraryName: appConfig.sharePoint.libraryName,
    },
    {
      id: inReviewId,
      title: 'Remote Work Announcement',
      documentType: 'announcement',
      status: 'in_review',
      requesterEmail: 'alex.requester@contoso.com',
      priority: 'normal',
      currentApproverEmail: 'morgan.comms@contoso.com',
      createdAt,
      updatedAt: createdAt,
      freeformRequest:
        'Announce hybrid work Fridays for HQ staff starting next month.',
      draftBodyMarkdown: `# Remote Work Announcement

Hybrid work Fridays begin next month for HQ staff.
`,
      draftSummary: 'Hybrid Fridays announcement',
      authorEmail: appConfig.localDemoUser.email,
      approvalSteps: [
        {
          id: randomUUID(),
          order: 1,
          approverEmail: 'morgan.comms@contoso.com',
          approverDisplayName: 'Morgan Communications',
          role: 'Communications',
          status: 'pending',
          comment: null,
          decidedAt: null,
        },
      ],
      history: [
        {
          id: randomUUID(),
          at: createdAt,
          actorEmail: appConfig.localDemoUser.email,
          action: 'submitted_for_approval',
          message: 'Submitted to approval chain',
        },
      ],
      publishedPdfUrl: null,
      sharePointItemId: null,
      requestedPublishSiteUrl: appConfig.sharePoint.siteUrl,
      requestedLibraryName: appConfig.sharePoint.libraryName,
    },
  ]
}

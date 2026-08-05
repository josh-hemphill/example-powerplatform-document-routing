export type DocumentStatus =
  | 'requested'
  | 'drafting'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'published'

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  requested: 'Requested',
  drafting: 'Drafting',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  published: 'Published',
}

export const DOCUMENT_STATUS_COLORS: Record<
  DocumentStatus,
  'default' | 'info' | 'warning' | 'success' | 'error' | 'primary' | 'secondary'
> = {
  requested: 'info',
  drafting: 'secondary',
  in_review: 'warning',
  approved: 'success',
  rejected: 'error',
  published: 'primary',
}

/** Ordered workflow stages shown in the document workspace stepper. */
export const WORKFLOW_STAGES = [
  'requested',
  'drafting',
  'in_review',
  'approved',
  'published',
] as const satisfies readonly DocumentStatus[]

/**
 * Maps a document status to the active workflow stage index.
 */
export function getWorkflowStageIndex(status: DocumentStatus): number {
  if (status === 'rejected') {
    return WORKFLOW_STAGES.indexOf('in_review')
  }
  return Math.max(0, WORKFLOW_STAGES.indexOf(status))
}

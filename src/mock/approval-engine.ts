import { randomUUID } from 'node:crypto'
import type { ApproverPerson } from '../domain/approval-queue.ts'
import {
  addHoursIso,
  isEmailInPool,
  isSlaOverdue,
  mergeApproverPools,
} from '../domain/approval-queue.ts'
import type { MockApprovalStep, MockDocumentRecord } from './seed-documents.ts'

const nowIso = (clock?: Date): string => (clock ?? new Date()).toISOString()

/**
 * Syncs summary-facing current-* fields from the active approval step.
 */
export function syncCurrentApprovalFields(document: MockDocumentRecord): void {
  const active = document.approvalSteps.find(
    (step) => step.status === 'queued' || step.status === 'pending',
  )
  document.currentApproverEmail = active?.approverEmail ?? null
  document.currentStepStatus = active?.status ?? null
  document.currentStepDueAt = active?.dueAt ?? null
  document.currentStepElevated = active ? active.elevated : null
  document.currentPoolEmails =
    active?.assignmentMode === 'pool'
      ? active.pool.map((member) => member.email)
      : []
}

export function createStepFromInput(
  input: {
    assignmentMode: 'named' | 'pool'
    role?: string
    slaHours?: number
    assignee?: ApproverPerson
    pool?: ApproverPerson[]
    elevationPool?: ApproverPerson[]
  },
  order: number,
  clock: Date,
  isActive: boolean,
): MockApprovalStep {
  const slaHours = input.slaHours ?? null

  if (input.assignmentMode === 'named') {
    if (!input.assignee) {
      throw new Error('Named approval steps require an assignee')
    }
    return {
      id: randomUUID(),
      order,
      assignmentMode: 'named',
      approverEmail: input.assignee.email,
      approverDisplayName: input.assignee.displayName,
      role: input.role ?? input.assignee.role ?? null,
      status: isActive ? 'pending' : 'waiting',
      pool: [input.assignee],
      elevationPool: input.elevationPool ?? [],
      slaHours,
      dueAt: isActive && slaHours ? addHoursIso(slaHours, clock) : null,
      claimedAt: null,
      elevated: false,
      elevatedAt: null,
      comment: null,
      decidedAt: null,
    }
  }

  if (!input.pool?.length) {
    throw new Error('Pool approval steps require at least one pool member')
  }

  return {
    id: randomUUID(),
    order,
    assignmentMode: 'pool',
    approverEmail: null,
    approverDisplayName: null,
    role: input.role ?? null,
    status: isActive ? 'queued' : 'waiting',
    pool: input.pool,
    elevationPool: input.elevationPool ?? [],
    slaHours,
    dueAt: isActive && slaHours ? addHoursIso(slaHours, clock) : null,
    claimedAt: null,
    elevated: false,
    elevatedAt: null,
    comment: null,
    decidedAt: null,
  }
}

/**
 * Activates the next waiting step after an approval.
 */
export function activateStep(step: MockApprovalStep, clock: Date): void {
  if (step.assignmentMode === 'pool') {
    step.status = 'queued'
    step.approverEmail = null
    step.approverDisplayName = null
    step.claimedAt = null
  } else {
    step.status = 'pending'
  }
  step.dueAt = step.slaHours ? addHoursIso(step.slaHours, clock) : null
}

export function claimStep(
  step: MockApprovalStep,
  actorEmail: string,
  clock: Date,
): void {
  if (step.assignmentMode !== 'pool' || step.status !== 'queued') {
    throw Object.assign(new Error('Only queued pool steps can be claimed'), {
      code: 'invalid_state',
    })
  }
  if (!isEmailInPool(step.pool, actorEmail)) {
    throw Object.assign(new Error('Actor is not in the eligible pool'), {
      code: 'forbidden',
    })
  }
  const member = step.pool.find(
    (item) => item.email.toLowerCase() === actorEmail.toLowerCase(),
  )!
  step.status = 'pending'
  step.approverEmail = member.email
  step.approverDisplayName = member.displayName
  step.claimedAt = nowIso(clock)
  step.dueAt = step.slaHours ? addHoursIso(step.slaHours, clock) : step.dueAt
}

export function releaseStep(step: MockApprovalStep, actorEmail: string): void {
  if (step.assignmentMode !== 'pool' || step.status !== 'pending') {
    throw Object.assign(new Error('Only claimed pool steps can be released'), {
      code: 'invalid_state',
    })
  }
  if (step.approverEmail?.toLowerCase() !== actorEmail.toLowerCase()) {
    throw Object.assign(new Error('Only the claimer can release this step'), {
      code: 'forbidden',
    })
  }
  step.status = 'queued'
  step.approverEmail = null
  step.approverDisplayName = null
  step.claimedAt = null
}

/**
 * Elevates overdue active steps: expands pool, returns to queue, refreshes SLA.
 */
export function processStepSla(
  step: MockApprovalStep,
  clock: Date,
): { changed: boolean; message: string | null } {
  if (step.status !== 'queued' && step.status !== 'pending') {
    return { changed: false, message: null }
  }
  if (!isSlaOverdue(step.dueAt, clock)) {
    return { changed: false, message: null }
  }

  const hadElevationMembers = (step.elevationPool?.length ?? 0) > 0
  if (!step.elevated && hadElevationMembers) {
    step.pool = mergeApproverPools(step.pool, step.elevationPool)
    step.elevated = true
    step.elevatedAt = nowIso(clock)
  }

  if (step.assignmentMode === 'pool') {
    step.status = 'queued'
    step.approverEmail = null
    step.approverDisplayName = null
    step.claimedAt = null
  }

  step.dueAt = step.slaHours ? addHoursIso(step.slaHours, clock) : null

  return {
    changed: true,
    message: step.elevated
      ? `SLA breached; pool elevated and timer reset (${step.role ?? 'step'} ${step.order})`
      : `SLA breached; timer reset (${step.role ?? 'step'} ${step.order})`,
  }
}

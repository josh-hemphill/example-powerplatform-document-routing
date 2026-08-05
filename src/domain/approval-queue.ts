export type ApprovalAssignmentMode = 'named' | 'pool'

export type ApprovalStepStatus =
  | 'waiting'
  | 'queued'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'skipped'

export interface ApproverPerson {
  email: string
  displayName: string
  role?: string
}

/**
 * Adds hours to an ISO timestamp (or now).
 */
export function addHoursIso(hours: number, from: Date = new Date()): string {
  return new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString()
}

/**
 * True when dueAt is in the past relative to `now`.
 */
export function isSlaOverdue(
  dueAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!dueAt) {
    return false
  }
  return new Date(dueAt).getTime() <= now.getTime()
}

/**
 * Merges elevation members into a pool without duplicate emails.
 */
export function mergeApproverPools(
  pool: ApproverPerson[],
  elevationPool: ApproverPerson[] | null | undefined,
): ApproverPerson[] {
  const byEmail = new Map<string, ApproverPerson>()
  for (const member of [...pool, ...(elevationPool ?? [])]) {
    byEmail.set(member.email.toLowerCase(), member)
  }
  return [...byEmail.values()]
}

/**
 * True if the actor email is in the eligible pool.
 */
export function isEmailInPool(
  pool: ApproverPerson[],
  actorEmail: string,
): boolean {
  const needle = actorEmail.toLowerCase()
  return pool.some((member) => member.email.toLowerCase() === needle)
}

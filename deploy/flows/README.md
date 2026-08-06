# Power Automate flow stubs — Document Routing

Phase 3 ships **documented stubs** (not packaged `.zip` solutions). Import these as
Cloud Flows in your environment, then bind Dataverse connections to the `dr_*`
tables from [`SCHEMA.md`](../SCHEMA.md).

## Identity

Flows that mutate approval steps or history must run as a **service principal /
elevated connection** — never as the end-user SPA token. The Code App only
triggers privileged work by writing Dataverse status fields or calling a Custom
Connector that starts a flow.

## Minimum set

| Flow                                               | Trigger                                                      | Notes                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [`sla-sweeper.json`](./sla-sweeper.json)           | Recurrence (e.g. every 15 min)                               | Finds overdue active steps; elevates / requeues; writes `dr_historyevent` |
| [`notify-approval.json`](./notify-approval.json)   | When `dr_approvalstep` is created/updated                    | Email/Teams to assignee or pool                                           |
| [`publish-approved.json`](./publish-approved.json) | When `dr_document.status` → `approved` **or** manual Publish | HTML→PDF→SharePoint (Phase 5 fills binary steps)                          |
| [`on-submit-guard.json`](./on-submit-guard.json)   | When status → `in_review`                                    | Optional double-check that chain rows exist                               |

## Elevation semantics (locked for this example)

**Named overdue → convert to elevated pool queue** (`convert_to_elevated_pool`):

1. Merge `elevationpool` members into the runtime pool.
2. Set `assignmentmode` = pool, clear named assignee, status = queued.
3. Set `elevated` / `elevatedat`.
4. Start a **new** `activatedueat` window for the elevated queue.
5. Claim/release **never** move `activatedueat`.

## Clock

Production sweeps use the flow’s wall clock. Do **not** accept a client-supplied
`now`. The Vite mock accepts `now` only when `import.meta.env.DEV` is true.

## Publish path (Phase 5)

- Code App **Publish** calls `POST /documents/{id}/publish` with an allowlisted
  `publishDestinationId` (optional folder override under that root).
- **No browser PDF/HTML upload.** The Vite mock (and hosted Cloud Flow) render and
  store the artifact under a service identity.
- Filename: `{title-slug}-{documentId8}-r{revision}.pdf`. Republishing the same
  revision is **idempotent** (returns the existing URL).
- Stub: [`flows/publish-approved.json`](./flows/publish-approved.json).

# Power Automate flow stubs — Document Routing

Templates in this folder use the default `dr_` publisher token as documentation.
**Adopters should import the prefix-correct copies** written by `pnpm provision` to
`deploy/generated/flows/` (substitution uses your `publisher.prefix`).

Prefer packaging flows **into the solution** over “import JSON manually and rebind”
after every prefix change. See [`SHARED_ENV.md`](../SHARED_ENV.md).

## Identity

Flows that mutate approval steps or history must run as a **Document Routing Service**
principal / elevated connection — never as the end-user SPA token. The Code App only
triggers privileged work by writing Dataverse status fields or calling a Custom
Connector that starts a flow.

## Minimum set

| Flow                                               | Trigger                                                     | Notes                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`sla-sweeper.json`](./sla-sweeper.json)           | Recurrence (e.g. every 15 min)                              | Finds overdue active steps; elevates / requeues; writes `{prefix}_historyevent` |
| [`notify-approval.json`](./notify-approval.json)   | When `{prefix}_approvalstep` is created/updated             | Email/Teams to assignee or pool                                                 |
| [`publish-approved.json`](./publish-approved.json) | When `{prefix}_document.status` → `approved` **or** Publish | HTML→PDF→SharePoint (Phase 5 fills binary steps)                                |
| [`on-submit-guard.json`](./on-submit-guard.json)   | When status → `in_review`                                   | Optional double-check that chain rows exist (also fires for dispatch-on-create) |

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
- Stub: [`flows/publish-approved.json`](./publish-approved.json).

## Flow health rows (Admin)

At the end of each SLA sweeper or publish run, write a health row so Admin →
**Flow health** can show recent outcomes:

1. Create (or append to) `{prefix}_flowrun` — or patch a JSON blob on `{prefix}_appsetting` if
   you skip a dedicated table in early environments.
2. Fields: `flowname`, `status` (`succeeded`/`failed`/`running`), `at`, `message`.
3. Keep a short rolling window (mock keeps 20).

The local mock seeds a failed publish row for demo and records runs via
`recordFlowRun` in `src/mock/control-store.ts`. See [`SCHEMA.md`](../SCHEMA.md).

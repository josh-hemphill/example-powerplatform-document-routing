# Dataverse schema — Document Routing

Canonical table model for Phase 1+. The OpenAPI mock and Vue app should mirror these
concepts; **Dataverse is the system of record** for hosted deployments.

## Collaboration model

Documents (`dr_document`) are **user-owned**. On create (or type select), the case is
**shared with the document type’s author collaboration team** (`authorteamexternalid`)
so peers can open and co-edit `requested` / `drafting` content before submit.

After submit-for-approval, content is frozen at `contentrevision` unless a
withdraw/revise transition invalidates approval steps.

## SLA model

| Field                             | Meaning                                                                    |
| --------------------------------- | -------------------------------------------------------------------------- |
| `approvalstep.activatedueat`      | Immutable deadline set when the step activates                             |
| `approvalstep.dueat`              | Denormalized mirror for inbox filters — **do not extend on claim/release** |
| `approvalstep.elevationsemantics` | Default: `convert_to_elevated_pool` (named overdue → elevated pool queue)  |

Named elevation (locked): convert overdue named steps to an elevated **pool**
queue, merge elevation members, start a new activate window once. See
[`flows/README.md`](./flows/README.md).

## Control tables (org-owned)

| Table                                 | Purpose                                                        |
| ------------------------------------- | -------------------------------------------------------------- |
| `publishdestination`                  | Allowlisted SharePoint site / library / folder roots           |
| `approverpool` / `approverpoolmember` | Named pools + members (email/UPN denormalized)                 |
| `documenttype`                        | Type metadata, draft scaffold, policy version, author team id  |
| `approvalchainstep`                   | Ordered template steps (named or pool + SLA + elevation)       |
| `appsetting`                          | Feature flags (`allowApproverOverride`, collaboration mode, …) |

## Case tables

| Table          | Purpose                                                               |
| -------------- | --------------------------------------------------------------------- |
| `document`     | Request + draft + denormalized inbox/SLA + publish destination lookup |
| `approvalstep` | Runtime chain instance with activate SLA + approved revision          |
| `historyevent` | Audit trail                                                           |

## Lookups

Lookup columns are created via **`POST /RelationshipDefinitions`**
(`OneToManyRelationshipMetadata` + nested `Lookup`), not by nesting relationship
metadata inside `/Attributes`.

## Seed

`pnpm provision` writes `deploy/generated/control-seed.json` from
`src/config/document-types.ts`. Contoso/example emails are **demo only** — replace
before production (Admin UI in Phase 4).

## Title length

Document titles are capped at **200** characters (aligned with OpenAPI / UI).

## Optimistic concurrency (CAS)

Hosted Dataverse writes should use **row version** concurrency so claim / decide /
publish races fail closed instead of last-write-wins.

| Surface           | Strategy                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dr_document`     | Include `versionnumber` (or ETag) on PATCH; send `If-Match` from the version loaded for the command                                                                                         |
| `dr_approvalstep` | Same — claim and decide must condition on the step row version observed when the UI loaded the active step                                                                                  |
| Mock              | No row versions; the state machine returns `invalid_state` → HTTP **409** when a second claimer hits a non-`queued` step or a second decide hits a non-`pending` / non-`in_review` document |

### Expected conflict outcomes

| Race                                           | Result                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Two pool members claim the same queued step    | First wins; second → **409** (`Only queued pool steps can be claimed`)    |
| Double decide on the same pending step         | First wins; second → **409** (`invalid_state`)                            |
| Stale draft PUT after withdraw / status change | **409** (`invalid_state`) when status is no longer `requested`/`drafting` |

UI surfaces these via `getApiErrorMessage` (Phase 6). Do not silently overwrite local dirty drafts on unrelated refetch (Phase 6 form state).

## Flow health (`flowrun`)

Optional / soft table (or `appsetting`-backed log) for Admin **Flow health**:

| Field      | Meaning                              |
| ---------- | ------------------------------------ |
| `flowname` | Display name of the Cloud Flow       |
| `status`   | `succeeded` \| `failed` \| `running` |
| `at`       | Run timestamp                        |
| `message`  | Short outcome for operators          |

Hosted Flows should append a row (or update `appsetting`) at the end of SLA / publish runs. The Vite mock seeds success and failure samples and calls `recordFlowRun` on SLA changes and publish.

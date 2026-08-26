# Review feedback, control data, and Typst Studio horizon

Plan to make **engineering / high-authority review comments first-class, persistent, and actionable**; to treat **priorities, mission-critical reasons, and document subtypes as Admin-configurable control data with server enforcement**; and to record a **later integration path with Typst Doc Studio** (`josh-hemphill/typst-doc-repo`) that this repo **must not implement yet**.

**Status:** Not started. Phases **23–27** are the next product work. Horizon **T0–T6** is design-only.

**Preceding roadmaps:** [`remediation-roadmap.md`](./remediation-roadmap.md) (0–8), [`post-phase-8-review-roadmap.md`](./post-phase-8-review-roadmap.md) (9–13), [`post-phase-13-review-roadmap.md`](./post-phase-13-review-roadmap.md) (14–17), [`provisioning-alm-roadmap.md`](./provisioning-alm-roadmap.md) (18–22, done).

**Suggested order:** Phase 23 → 24 → 25 → 26 → 27. Phase 25 (priorities) can start in parallel with 24 after 23’s OpenAPI bump. Phase 26 (subtypes) trails 23 because submit-time chain materialization changes. Horizon T\* waits until 23–27 are in production use.

---

## Why this work exists

Today’s product is a **gate-based approval chain**, not a **review-comment loop**.

| What users need | What the code does today |
| --------------- | ------------------------ |
| See reviewer feedback without hunting | `ApprovalStep.comment` is a subtitle on `ApprovalStepper.vue`; inbox and header never show it |
| Keep comments after “Withdraw & revise” | `withdrawAndRevise()` in `src/mock/approval-engine.ts` sets `approvalSteps = []`, deleting the only structured comments |
| Trust History as the source of truth | Seeded Gift Policy Amendment stores `"Need manager attestation language before approval"` on the step but `"Rejected — revise and resubmit"` on `history[0].message` (`src/mock/seed-documents.ts`) |
| Treat Legal / Compliance / Engineering as higher-authority than a pool claim note | Chain steps have a free-text `role` only; no authority, no required-comment policy |
| Configure priority including mission-critical + reason | Hardcoded `low \| normal \| high`; stored but **not shown** in inbox/workspace; **no reason field**; **no server rule** |
| Subtypes (Policy → HR vs IT; SOP → Safety vs Operations) | Flat `documentType` id; one chain and one scaffold per type |
| Author Markdown in Typst Studio, then route/approve/publish here | Separate repos; this app snapshots Markdown in Dataverse and publishes HTML→PDF |

This document is the implementation contract for the first six rows. The last row is **Horizon** only.

---

## Guiding decisions

| Decision | Choice |
| -------- | ------ |
| Source of truth | Dataverse control + case tables. The Vite mock and OpenAPI **mirror** hosted rules; UI never owns policy. |
| Comments vs history | **`reviewcomment` is the human-feedback store.** `historyevent` stays an append-only machine audit (`action` + short `message`). Do not make History the comment UI. |
| Persistence across revise | Reviewer comments **survive** withdraw/revise/resubmit. Clearing runtime `approvalstep` rows must **copy or already have copied** comments into `reviewcomment` first. Prefer writing `reviewcomment` at decide-time so withdraw cannot lose them. |
| Authority | Frozen onto each comment from the **chain template** at submit (`authorityLevel` on `approvalchainstep` → runtime step → comment). Do not infer authority from the `role` string. |
| Actionability | Authors **respond** to open comments (especially `authoritative`). Resubmit is **blocked** while authoritative comments are `open`. Standard comments can be acknowledged without a long reply. Advisory comments are visible only. |
| Priorities | **Control catalog**, not a hardcoded OpenAPI enum forever. Seed `low`, `normal`, `high`, `mission_critical`. `requiresReason` + `minReasonLength` are catalog columns. The mock **and** hosted path reject create/update when the selected row requires a reason and the reason is missing/short. |
| Subtypes | Optional per document type. If a type has **any active subtype**, create **requires** a subtype. Chain/scaffold/hint/number-prefix may override per subtype; otherwise inherit the type. |
| Custom fields / EAV | **Out of 23–27.** Do not build a general field-definition engine. Priorities, subtypes, and comment-policy columns are the configurable surface. |
| Typst Doc Studio | **Do not implement in 23–27.** Keep Git as Studio’s store and Dataverse as Routing’s store until Horizon T2+ has an immutable commit snapshot. |
| Identity | Unchanged: principal from host / mock actor header. Comments record `actorEmail` server-side. |
| Policy versioning | In-flight cases keep the chain, authority, and subtype resolution captured at **submit**. Admin edits apply to the **next** submit. Priority catalog edits apply to **new** creates (and to explicit priority changes, if we allow them). |

---

## Finding → phase map

| Finding (summary) | Severity | Phase |
| ----------------- | -------- | ----- |
| `withdrawAndRevise` deletes `approvalSteps` (and their comments) | Critical | 23 |
| History message often omits the reviewer comment | High | 23 |
| No durable comment entity; submit/claim comments are history-only | High | 23 |
| Approval comments are optional one-line fields | High | 24 |
| Rejected authors have no feedback banner; draft is disabled until withdraw | High | 24 |
| Inbox/library never preview rejection or last comment | High | 24 |
| Authoritative reviewers are indistinguishable from pool claim notes | High | 23, 24 |
| Resubmit does not require addressing prior feedback | High | 24 |
| Priority is hardcoded, invisible in lists, unused by workflow | High | 25 |
| No mission-critical level; no required reason text | High | 25 |
| Client can omit reason even if UI asks for it | Critical (enforcement) | 25 |
| No per-type subtypes; one chain/scaffold per type | High | 26 |
| Admin cannot configure authority, priorities, or subtypes | High | 23, 25, 26, 27 |
| Provision/roles/flows/schema-drift unaware of new tables | High | 27 |
| Typst Studio overlap (authoring vs routing) unresolved | Horizon | T0–T6 |

---

## Target domain model

### Comments (case)

New table `reviewcomment` (user-owned, like `approvalstep`; shared with the document’s collaborators).

| Column | Meaning |
| ------ | ------- |
| `document` | Lookup to case |
| `kind` | `decision` \| `submission` \| `author_response` \| `acknowledgement` |
| `authorityLevel` | `advisory` \| `standard` \| `authoritative` (frozen copy) |
| `status` | `open` \| `addressed` \| `acknowledged` \| `voided` |
| `body` | Comment text (required, min length by kind/authority) |
| `actorEmail` / `actorDisplayName` | Server-stamped principal |
| `role` | Frozen step role label (Legal, Compliance, Engineering Review, …) |
| `sourceStepId` | Optional UUID of the runtime step that produced this comment (may later be deleted) |
| `sourceStepOrder` | Frozen order for display after withdraw |
| `submittedContentRevision` | Cycle this comment belongs to |
| `inReplyTo` | Optional lookup to parent `reviewcomment` (author response → decision comment) |
| `createdAt` | Immutable |

**Write path at decide:** `decideStep` still stores `approvalstep.comment` for the live stepper, **and** inserts a `reviewcomment` (`kind=decision`). History records `rejected` / `step_approved` with a **short** message (`Rejected by Compliance`) and a `reviewCommentId` if we add that optional field — **not** a substitute body.

**Write path at withdraw:** Do **not** create comments from leftover step fields as a best-effort copy unless a decide-time insert failed. Withdraw only voids comments that are no longer applicable if we ever need that (v1: leave them `open`).

**Author response:** `POST /documents/{id}/review-comments/{commentId}/respond` with `body`. Sets parent `status=addressed`, inserts child `kind=author_response`. Authoritative comments require non-whitespace body ≥ `AUTHORITATIVE_RESPONSE_MIN_LENGTH` (named constant, default 20). Standard comments may `POST …/acknowledge` without a body.

### Authority on the chain (control)

Extend `approvalchainstep` / OpenAPI `ControlChainStep` / runtime `ApprovalStep`:

| Field | Meaning |
| ----- | ------- |
| `authorityLevel` | `advisory` \| `standard` \| `authoritative` (default `standard`) |
| `commentPolicy` | `optional` \| `required_on_reject` \| `required_on_decision` |

Seed mapping (Admin-editable, not inferred at runtime):

| Seed step | `authorityLevel` | `commentPolicy` |
| --------- | ---------------- | --------------- |
| Legal Reviewers (policy pool) | `authoritative` | `required_on_reject` |
| Compliance named | `authoritative` | `required_on_reject` |
| Operations / Quality / Communications | `standard` | `required_on_reject` |
| Elevation-only pool members | inherit the step | inherit |

`required_on_reject` is enforced **server-side** on `POST …/decision` when `decision=reject`. The UI uses a textarea labeled “Reason for rejection (required)” vs “Approval notes (optional)”.

### Priorities (control)

New org-owned table `prioritylevel`:

| Column | Meaning |
| ------ | ------- |
| `key` | Stable id (`low`, `normal`, `high`, `mission_critical`) |
| `label` | Display (`Mission critical`) |
| `rank` | Integer sort (higher = more urgent). Seed: 10 / 20 / 30 / 40 |
| `color` | UI token (`default` \| `info` \| `warning` \| `error`) |
| `requiresReason` | Boolean |
| `minReasonLength` | Integer, used only when `requiresReason` (seed 20 for mission-critical) |
| `reasonHint` | Admin copy shown under the reason box |
| `active` | Boolean |
| `slaHoursMultiplier` | Optional decimal; `null` means no SLA change (v1: store, do not apply until product asks) |

Case columns on `document`:

| Column | Meaning |
| ------ | ------- |
| `priority` | Key from catalog (keep existing choice **or** migrate to string keyed by catalog; see Phase 25) |
| `priorityReason` | Memo, required when catalog row `requiresReason` |
| `prioritySetAt` / `prioritySetBy` | Optional audit (or rely on history `priority_set`) |

### Subtypes (control)

New org-owned table `documentsubtype`:

| Column | Meaning |
| ------ | ------- |
| `key` | Stable id (`hr`, `it`, `safety`) unique **per type** |
| `label`, `description`, `active` | Catalog |
| `documenttype` | Lookup |
| `requesthint` / `draftscaffold` / `numberprefix` | Optional overrides (`null` = inherit type) |
| `usesownchain` | Boolean; when true, `approvalchainstep.documentsubtype` rows are required and non-empty at save |

Case: `documentsubtype` lookup + denormalized `documentsubtypeid` string (same pattern as `documenttypeid` / `typedocument`).

**Create rule:** `activeSubtypes(type).length > 0` ⇒ `documentSubtype` required and must belong to that type and be active.

**Submit rule:** `materializeApprovalSteps(typeId, subtypeId)` uses subtype chain when `usesownchain`, else type chain.

---

## Workspace UX contract (Phase 24)

The Review Feedback panel is **not** a History filter and **not** a third subtitle on the stepper.

```text
┌ Workspace header (status, type, subtype, priority chip, “N open comments”)
├ Review feedback (always mounted; not inside the numbered stage accordion)
│  ├ Unresolved — authoritative  (blocking)
│  ├ Unresolved — standard
│  └ Addressed this cycle / earlier cycles (collapsed)
├ 1. Freeform request
├ 2. Author / draft          ← enabled only after withdraw, as today
├ 3. Approval chain          ← live stepper; comments duplicated as links into the panel
└ 4. Publish
```

### Panel behaviors

1. **Always visible** on `in_review`, `rejected`, `drafting` (after a prior review), `approved`. Hidden only on `requested` with zero comments, and on `published` / `superseded` / `abandoned` unless the reader expands “Review record”.
2. Each comment card shows **authority badge**, **role**, **actor display name**, **time**, **body**, **cycle** (`revision N`). Authoritative cards use `error`/`warning` tonal styling and `role="status"` when the case is `rejected`.
3. **Primary author CTA on reject:** “Withdraw & revise to address feedback” in the panel (and keep the approval-panel control). Copy names the blocking comments.
4. After withdraw, panel stays populated; draft stage becomes the primary expanded stage **and** the panel remains open above it (`primaryWorkspaceStage` grows a `feedback` concern rather than stealing `approval` for rejected).
5. **Resubmit:** `canSubmitApproval` is false while any `authoritative` comment is `open`. Helper text lists them. Standard open comments show a confirm: “N standard comments are still open. Submit anyway?”
6. Approver compose UI: `v-textarea` (not `v-text-field`); label and required state from `commentPolicy` + decision.
7. Inbox row secondary line: `Rejected — {truncated comment}` or `N open comments` + priority chip. API: add `openAuthoritativeCommentCount`, `lastReviewCommentPreview`, `priority` (already on summary but unused) to `DocumentSummary`.

### What History becomes

Human-readable labels for `event.action` (`src/domain/history-actions.ts` — new). Decision rows may include “See review feedback” but must not be the only place the body lives.

---

## Phase 23 — Durable review comments and authority

**Goal:** Comments are a first-class case entity, written at decision time, copied onto summaries, and still present after withdraw. Authority and comment policy exist on chain templates and runtime steps. History is audit-only.

**Not in this phase:** The dedicated Vue panel (24), priority catalog (25), subtypes (26).

### Work

1. **OpenAPI 1.8** (`openapi/document-routing.yaml`):
   - Schemas: `ReviewComment`, `ReviewCommentAuthority`, `ReviewCommentKind`, `ReviewCommentStatus`, `CommentPolicy`.
   - Extend `ControlChainStep`, `ApprovalStep`, `ApprovalStepInput` with `authorityLevel`, `commentPolicy`.
   - Extend `Document` with `reviewComments: ReviewComment[]` (or a sibling `GET /documents/{id}/review-comments` **and** embed on GET document to avoid a second round-trip for the workspace). Prefer **embed on GET document** plus list filter on summaries.
   - Extend `DocumentSummary` with `openAuthoritativeCommentCount`, `lastReviewCommentPreview` (nullable string, ~140 chars).
   - `ApprovalDecisionRequest.comment` stays; description says server copies it to `reviewcomment` and **requires** it when the step’s `commentPolicy` demands it.
   - New: `respondToReviewComment`, `acknowledgeReviewComment` (can be stubbed 501 in 23 if UI is 24 — **do not**: land write APIs in 23 so 24 is UI-only).
2. **Dataverse** (`src/provisioning/dataverse-schema.ts`, `deploy/SCHEMA.md`): table `reviewcomment`; new choice sets for kind/status/authority/commentPolicy; columns on `approvalchainstep` and `approvalstep`.
3. **Mock engine:**
   - `decideStep` inserts `reviewcomment` before mutating status.
   - Reject with missing comment + `required_on_reject` → `400` `comment_required`.
   - `withdrawAndRevise` **must not** delete `reviewComments`. Runtime steps may still clear.
   - `pushHistory` for decisions uses a short label; never the only copy of `body`.
4. **Seed:** Gift Policy Amendment history and comments agree; add a second authoritative comment on a rejected SOP if useful.
5. **Domain:** `src/domain/review-comments.ts` — helpers: `openAuthoritativeComments`, `previewLastComment`, `isCommentRequired(step, decision)`, `canSubmitWithOpenComments`.
6. **Control editors:** `createEmptyChainStep` defaults `authorityLevel: 'standard'`, `commentPolicy: 'required_on_reject'`.
7. **Tests:** `approval-engine.test.ts` (persist across withdraw; required reject comment); new `review-comments.test.ts`; seed assertion that step body === comment entity body; OpenAPI/schema-drift once 27’s generator is updated — **minimal drift test in 23** so CI fails if columns are forgotten.

### Files (expected)

- `openapi/document-routing.yaml`
- `src/provisioning/dataverse-schema.ts`, `deploy/SCHEMA.md`
- `src/mock/approval-engine.ts`, `src/mock/routes/approvals.ts`, `src/mock/seed-documents.ts`, `src/mock/document-http.ts`, `src/mock/control-store.ts`
- `src/domain/review-comments.ts` (+ tests)
- `src/domain/control-editors.ts` (+ tests)
- `src/client/*` via `pnpm generate:api`

### Acceptance

- Withdraw a rejected seeded document in the mock: `GET` still returns the reviewer body on `reviewComments`.
- `POST` reject without comment on an authoritative/required step → 400.
- History `message` is short; comment body is on `reviewComments`.
- `pnpm test` covers persist + required-comment.

---

## Phase 24 — Review Feedback panel and author loop

**Goal:** Authors and approvers see high-authority feedback first, can act on it, and cannot quietly resubmit past unresolved authoritative comments.

### Work

1. **`ReviewFeedbackPanel.vue`** — grouped cards, respond/acknowledge, withdraw CTA, empty state (“No review comments yet”).
2. **`DocumentWorkspaceView.vue`** — mount panel **above** the numbered stages; keep it expanded when `openAuthoritativeCommentCount > 0` or `status === 'rejected'`.
3. **`WorkspaceHeader.vue`** — chip `N open comments`; link/scroll to panel (`#review-feedback`).
4. **`ApprovalPanel.vue` / `ApprovalStepper.vue`** — textarea; required indicator; stepper shows “View in Review feedback” rather than stuffing the body into a subtitle (keep a one-line excerpt).
5. **`use-workspace-commands.ts` / capabilities** — `canSubmitApproval` includes `canSubmitWithOpenComments`; `onDecision('reject')` client-validates comment; respond/acknowledge mutations; preserve in-progress response text across soft refetch (same pattern as `use-document-form-state.ts`).
6. **`primaryWorkspaceStage`** — rejected: still reveal draft **after** withdraw; while rejected, default expand feedback + approval, not only approval.
7. **Inbox / library summaries** — show preview + count + (if already on summary) priority later in 25. Add inbox secondary line now using `lastReviewCommentPreview`.
8. **Confirm copy** — reject dialog: “This step requires a reason. It will appear in Review feedback for the authors.”
9. **a11y** — panel `section` with heading; authoritative open comments `role="status"`; do not use `role="alert"` on every render (avoid repeat announcements). Extend `src/a11y/landmarks.axe.test.ts` fixture for the panel heading.
10. **Tests:** Vue Test Utils for panel grouping and disabled submit; form-state test that respond draft survives refetch.

### Acceptance (manual + automated)

- Open Gift Policy Amendment as requester: the attestation sentence is the **first** thing in Review feedback, not a History footnote.
- Withdraw: comments remain; draft enables; resubmit stays disabled until an author response is saved on the authoritative comment.
- Approver reject without textarea body: client + server block.
- Inbox rejected row shows a preview of that sentence.

---

## Phase 25 — Configurable priorities and mission-critical reasons

**Goal:** Admins own the priority catalog. `mission_critical` (or any row with `requiresReason`) **cannot** be stored without a server-validated reason. Inbox and workspace show priority. The create form is driven by the catalog, not a hardcoded three-item array.

### Work

1. **Control API:** `GET/POST/PUT /control/priority-levels` (Admin write; authenticated read of **active** rows for create form).
2. **Schema:** `prioritylevel` table; `document.priorityreason` memo; keep `document.priority` as string **key** matching `prioritylevel.key`.
   - **Migration:** today’s Dataverse choice `low/normal/high` becomes catalog-backed. Provisioning adds the choice value **or** replaces choice with string. Prefer **string key + catalog** so Admins can add `mission_critical` without a solution upgrade for every new level. If replacing choice is too breaking for already-provisioned orgs, add choice offset 13 `mission_critical` **and** still store reason; document the follow-up to generalize. **Plan default: string key + catalog** in mock/OpenAPI; provisioning note for existing choice columns (schema-drift / dual-read) in Phase 27.
3. **Create validation** (`src/mock/routes/documents.ts` + `src/api/form-rules.ts`):
   - Unknown / inactive key → 400 `unknown_priority`.
   - `requiresReason && trim(reason).length < minReasonLength` → 400 `priority_reason_required`.
   - Default key `normal` if omitted **only when** that row exists and does not require a reason.
4. **UI:**
   - `NewRequestView.vue` — select from `listPriorityLevels`; conditional required textarea with `reasonHint`.
   - `WorkspaceHeader.vue` / inbox / library — chip using catalog label + color; mission-critical uses `error`.
   - Optional: allow Admin/requester to **change** priority on `requested`/`drafting` with the same server rule + history `priority_changed`.
5. **Inbox sort:** `updatedAt` remains default; add `sort=priority` or always secondary-sort by `rank` desc then `updatedAt`. **Do** secondary-sort by rank so mission-critical floats without a new persona.
6. **Supersede:** copy priority **and** reason (`supersede-engine.ts`).
7. **Seed catalog + seed documents:** at least one `mission_critical` requested item with a reason; tests that omit reason fail.
8. **Do not** change SLA math in v1 even if `slaHoursMultiplier` is stored (column can exist, unused). Record as a follow-up in this file’s backlog.

### Acceptance

- Create with `mission_critical` and empty reason → 400; UI blocks submit.
- Create with reason ≥ min length → 201; header + inbox show **Mission critical**.
- Admin can deactivate `low` without a code change; create form omits it.
- Client omitting reason while sending `mission_critical` still fails in the mock (prove UI is not the only gate).

---

## Phase 26 — Document subtypes

**Goal:** Some types (not all) require a subtype. Subtype can override chain, scaffold, hint, and number prefix. Submit materializes the right chain.

### Work

1. **Control API:** nested under types or `/control/document-subtypes`. Admin writes; users read active subtypes for the selected type.
2. **Schema:** `documentsubtype`; `approvalchainstep.documentsubtype` nullable lookup; `document.documentsubtype` lookup + `documentsubtypeid` string.
3. **`materializeApprovalSteps(typeId, subtypeId)`** — subtype own-chain vs inherit. Empty own-chain + `usesownchain` → 400 on type save **and** on submit.
4. **Create:** if type has active subtypes, missing/wrong subtype → 400 `subtype_required` / `unknown_subtype`. Types with zero subtypes omit the field (Announcement stays simple).
5. **UI:**
   - `NewRequestView.vue` — cascading select; hide when no subtypes; reset subtype when type changes.
   - `WorkspaceHeader.vue` / inbox Type column — `Policy · HR` via `useDocumentTypeLabel` extension.
   - `AdminTypesPanel.vue` — subtype list editor (add/deactivate, override fields, optional chain editor or “inherit type chain”).
6. **Seed:** Policy → `corporate`, `hr`; SOP → `operations`, `safety` (safety uses own named QA + ops pool). Announcement: none.
7. **Library / PDF metadata:** include subtype label in reader header; PDF template (`html-pdf-template.ts`) subtitle line. Number prefix override only when set.
8. **Tests:** create without subtype on Policy → 400; Announcement without subtype → 201; submit safety SOP materializes safety chain, not default SOP chain; policy version still frozen at submit.

### Acceptance

- Switching type on New request clears a stale subtype.
- Admin-only chain override for Safety is what authors see in the approval preview.
- Existing mock documents without subtype still `GET` (nullable) and remain listable.

---

## Phase 27 — Admin, provision, roles, flows, and contract freeze

**Goal:** Hosted ALM matches the mock. New tables are in the solution, security roles, schema-drift checks, control seed, and Flow table allowlists. OpenAPI/SDK regenerated; SETUP documents the new Admin tabs.

### Work

1. **Admin IA:** tabs or sub-panels — Document types (now with subtypes + per-step authority/comment policy in `ApprovalChainEditor.vue`), **Priorities**, existing Pools / Destinations / Settings / Flow health.
2. **Dirty guards** — reuse `useAdminDirtyForm` / `useAdminSelectionGuard` for the new catalogs.
3. **`src/provisioning/security-roles-plan.ts` + `deploy/SECURITY_ROLES.md`:**
   - `prioritylevel`, `documentsubtype`: organization **read** for user/author/approver/publisher; org **write** for admin.
   - `reviewcomment`: create/read aligned with `approvalstep` / `historyevent` (authors create responses on shared docs; approvers create decision comments; users read on accessible cases).
4. **`schema-drift.ts` / `provisioning.test.ts` / `phases-20-22.test.ts` leftover-prefix checks** — include new tables.
5. **`control-seed.ts` / `src/config/document-types.ts`** — seed authority, subtypes, priority catalog. Contoso emails remain demo-only.
6. **Flows:** `on-submit-guard.json` resolves chain by type+subtype; `notify-approval.json` includes last comment preview and priority in the stub payload **without** inventing new connectors. SLA sweeper unchanged (no multiplier yet).
7. **SETUP.md / README** — one paragraph: Admin owns priorities/subtypes; mission-critical requires a reason; review comments survive revise.
8. **Contract tests:** mock and form-rules share named constants (`MISSION_CRITICAL_REASON_MIN_LENGTH`, `AUTHORITATIVE_RESPONSE_MIN_LENGTH`).

### Acceptance

- `pnpm provision` / `pnpm provision:validate` know the new tables.
- Non-admin cannot PUT priority catalog in the mock (403).
- `pnpm generate:api` is clean; `pnpm check` green.

---

## Sequencing, slicing, and dependencies

```text
23 Durable comments + authority on chain
        │
        ├──────────────► 24 Review Feedback panel (needs 23 APIs)
        │
        └──────────────► 25 Priority catalog (OpenAPI bump can share 23’s major if needed)
                                │
26 Subtypes (needs 23 materialize signature)
        │
        ▼
27 ALM / roles / seed / SETUP  (can land incrementally per phase, freeze in 27)
```

**PR slicing (implement later, not this PR):**

| PR | Title | Phase |
| -- | ----- | ----- |
| 1 | Add review-comment entity and persist comments across withdraw | 23 |
| 2 | Enforce comment policy and freeze authority on chain steps | 23 |
| 3 | Review Feedback workspace panel and author respond/acknowledge | 24 |
| 4 | Inbox/header surfaces for open comments | 24 |
| 5 | Priority catalog with server-enforced reasons | 25 |
| 6 | Document subtypes and chain inheritance | 26 |
| 7 | Admin + provision + roles for comments, priorities, subtypes | 27 |

---

## Testing strategy (Phases 23–27)

**Always, before claiming a phase done:**

1. `corepack pnpm check`
2. `corepack pnpm generate:api` when OpenAPI changed
3. Mock route tests for every new 400 (`comment_required`, `priority_reason_required`, `subtype_required`)
4. Engine test: reject → withdraw → `reviewComments` still present → respond → submit allowed
5. Manual (`pnpm dev`): Gift Policy Amendment as requester and as `sam.compliance@contoso.com`; New request mission-critical; Policy with HR subtype

**Do not** treat History-panel screenshots as proof that feedback works. Proof is the Review Feedback panel and a GET payload.

---

## Explicit non-goals (23–27)

- General EAV / per-type custom fields
- Inline draft annotations / suggestion-mode editing
- Email/Teams notification redesign (stub payload fields only)
- Applying `slaHoursMultiplier` to `activateDueAt`
- Markdown WYSIWYG or Typst preview in this app
- Merging with `typst-doc-repo`
- Requiring comments on **approve** except when `commentPolicy === required_on_decision` (seed uses reject-only)
- Publishing internal review comments into the SharePoint PDF

---

## Backlog after 27 (still this product, not Typst)

- Apply SLA multiplier for mission-critical
- Inbox persona “Rejected with feedback”
- Optional `required_on_decision` for a future “attestation” step
- Filter/search `q` over comment bodies (careful with PII)
- Dataverse column security on `priorityReason`

---

# Horizon — Typst Doc Studio integration (do not implement yet)

**Repos:** this app (Document Routing / control plane) and [`typst-doc-repo`](https://github.com/josh-hemphill/typst-doc-repo) (Typst Doc Studio / authoring plane).

**Status:** Design only. No code, schema, or deep links in Phases 23–27.

Studio’s own plan already says not to copy this product wholesale: approvals, SLA, and SharePoint publish are **out of Studio v1** (`typst-doc-repo/docs/usable-code-app-plan.md`). Routing’s README already says HTML→PDF (or Typst) must run **server-side**, never as browser-uploaded PDF bytes. Those two sentences are the integration law.

## Complementary responsibilities

| Concern | Document Routing (this repo) | Typst Doc Studio |
| ------- | ---------------------------- | ---------------- |
| Identity / AuthZ for the **case** | Dataverse roles, sharing, inbox personas | Entra to open the studio; GitLab/GitHub ACLs for **files** |
| Request, approval, SLA, numbering, supersede | Yes | No |
| Markdown + Typst rules as sources of truth | Draft Markdown **copy** on the case today | Markdown + Blockly rules **in Git** |
| Preview | Raw `<pre>` Markdown | WASM Typst SVG/PDF in a worker |
| Publish | Allowlisted SharePoint, Flow, immutable published version | Export PDF locally; Save commits to Git |
| Dataverse | Full case + control model | User-owned **recents** only (`tds_workspacerecent`) |

Shared accident: both are Vue 3 + Vite + Vuetify + Power Apps Code Apps. That is **not** a reason to merge apps. Byte-identical overlap today is essentially `App.vue` / toast helpers.

## Risks if merged too early

1. **Dual source of truth** — Dataverse `draftBodyMarkdown` vs Git `docs/*.md` will drift.
2. **Mutable approvals** — approving a branch name allows post-approval edits; must freeze a **commit SHA**.
3. **Trust boundary** — accepting Studio’s browser PDF would violate Routing’s publish model.
4. **Rendering parity** — browser Typst 0.15 + vendored `@preview` packages vs server compiler must pin the same versions.
5. **CSP / bundle** — Milkdown + Blockly + ~12 MiB WASM would blow this app’s shell budget and Code Apps CSP (`worker-src`).
6. **Atomicity** — Git commit, submit, Typst render, SharePoint upload, Dataverse update cannot be one transaction; need idempotency keys.
7. **Studio editor integrity** — Studio’s W1 still treats YAML frontmatter corruption as an open defect; Routing must not freeze a corrupted snapshot.

## Integration law (when we pick this up)

```text
Routing owns: case, AuthZ, chain, SLA, document number, SharePoint destination, audit.
Studio owns: repo workspace, Markdown WYSIWYG, Typst rules, preview.
Neither browser uploads authoritative PDF bytes.
Approvals reference an immutable Git commit + renderer pin, not a branch tip.
```

Suggested snapshot contract (not implemented now):

```ts
interface DocumentSourceSnapshot {
	provider: 'github' | 'gitlab';
	repository: string; // owner/repo or GitLab project path
	origin?: string; // GitLab host
	rootPath: string;
	targetId: string; // workspace.json document id
	commitSha: string;
	manifestHash: string;
	renderer: { engine: 'typst'; version: string; packageLockHash: string };
}
```

## Horizon phases (later PRs, later repo coordination)

### T0 — Written contract and non-goals

- Publish this section as the shared ADR (or copy a short ADR into Studio’s `docs/`).
- Freeze: no Dataverse-hosted Git drafts; no Routing-owned Blockly; no Studio-owned approval chain.
- Decide canonical Markdown during overlap: **Git after T2**, Dataverse-only for types that never opt into Studio.

### T1 — Deep link only (low risk)

- Optional case fields: `studioShareUrl` or forge URL + `rootPath` (strings, no fetch).
- Workspace “Open in Typst Studio” button when the URL is present (Admin-configured base).
- Authors still save Markdown in Routing. **No** submit-time Git read.

### T2 — Immutable snapshot at submit

- On submit-for-approval, Routing records `DocumentSourceSnapshot` from a **user- or Flow-provided** SHA (or a Flow that calls Git and writes the SHA).
- Approvals and PDF render **that SHA**. Branch moves do not change the frozen case.
- Withdraw/revise requires a new snapshot on the next submit.
- Reject Studio Save that is not a single atomic commit (Studio W3) before relying on this.

### T3 — Extract shared compile library

- Move Studio’s pure TS (`markdown-to-typst`, `typst-from-program`, `compose-typst-document`, package pins) into a versioned package both repos can depend on.
- Do **not** move Vue islands or WASM client into Routing.
- Routing Flow/container uses the same package + pinned Typst CLI/WASM **on the server**.

### T4 — Server-side Typst publish adapter

- Replace or parallel the HTML template in `src/publishing/` with: fetch snapshot → compose → Typst compile → SharePoint, under the existing allowlist and Publisher role.
- Idempotency key: `{documentId}:{contentRevision}:{commitSha}`.
- Browser never posts PDF bytes (unchanged).

### T5 — Opt-in Git-canonical types

- Document type flag `authoringMode: dataverse_markdown | git_studio`.
- Git-canonical types: Routing draft textarea becomes read-only summary + “Edit in Studio”; `draftBodyMarkdown` is a cache of the snapshot, not independently authoritative.
- Keep Dataverse-markdown types for Announcement-like short docs.

### T6 — Operations

- Hosted Studio GitLab connector + Routing environment DLP/CSP documented together.
- Renderer version displayed on the published reader (`Typst 0.15 · lock abc123`).
- Failure UX: Git 403 vs Routing 403 copy must stay distinct (Studio already maps remote errors).

## Merge recommendation (unchanged)

**Integrate through a boundary. Do not fully merge the applications.** Extract compile code (T3) only after T2’s snapshot exists. A monorepo is optional packaging later; it is not required for T1–T4.

---

## Open product questions (resolve before or during the named phase)

| Question | Default if unanswered | Phase |
| -------- | --------------------- | ----- |
| Can requesters change priority after create? | Yes, only in `requested`/`drafting`, same reason rules | 25 |
| Do authoritative **approvals** (not just rejects) require a comment? | No (`required_on_reject` seed) | 23 |
| Should mission-critical shorten SLA in v1? | No; store multiplier only | 25 |
| Subtype required for all types or only those with rows? | Only types with ≥1 active subtype | 26 |
| Who may respond to a comment? | Requester, author, collaborator (same as withdraw) | 24 |
| May an approver edit their comment after decide? | No; void + new comment if we ever need it | 23 |

---

## Definition of done (23–27 together)

A skeptical reviewer can:

1. Reject Gift Policy Amendment with a required reason and see that reason in **Review feedback** after withdraw.
2. Fail to resubmit until they write an author response to the authoritative comment.
3. Create a **mission-critical** request only with a reason; omitting it fails in UI **and** `curl` against the mock.
4. Create a Policy with subtype HR and see type+subtype on the case; Announcement still has no subtype control.
5. Confirm History is an audit log, not the comment inbox.
6. Confirm nothing in the diff talks to Typst Doc Studio except this horizon section.

# Remediation roadmap — Document Routing

Plan to address the codebase review findings by making **Dataverse the system of record** for data, routing, and permissions; using **Power Automate only where the platform must elevate**; adding an **admin control surface**; and bringing **tooling** (ESLint, tree-shakable icons, CI) in line with the rest of this org’s public projects.

This is intentional scaffolding evolution for an example Code App — not a rewrite of the Vue shell.

> **Phases 0–8 status:** Implemented on `main`.  
> **Post–Phase 8:** Phases **9–13** implemented (identity/authz → workflow concurrency → approval UX → nav/responsive → admin/a11y). See [`post-phase-8-review-roadmap.md`](./post-phase-8-review-roadmap.md).  
> **Post–Phase 13:** Phases **14–17** implemented (dirty-state/races → AuthZ fidelity → list performance → UI/a11y polish). See [`post-phase-13-review-roadmap.md`](./post-phase-13-review-roadmap.md).  
> **Next (deploy):** [`provisioning-alm-roadmap.md`](./provisioning-alm-roadmap.md) (Phases 18–22: publisher/solution ALM → connection refs → security roles → prefix-aware flows → shared-env CI).  
> **Next (product):** [`review-feedback-and-control-data-roadmap.md`](./review-feedback-and-control-data-roadmap.md) (Phases 23–27: durable review comments, Review Feedback panel, configurable priorities / mission-critical reasons, subtypes; Typst Doc Studio is horizon-only).

---

## Guiding decisions

| Decision             | Choice                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source of truth      | Dataverse tables (case + control/config). Frontend and local mock **mirror** that model; they do not own policy.                                                                                        |
| Identity             | Always from Power Apps host / Dataverse caller principal. **Never** accept `actorEmail` / spoofable identity on commands.                                                                               |
| Collaborative drafts | `requested` / `drafting` records are **readable (and co-editable by authors)** across collaborators before submit. Content freezes (or versions) on submit-for-approval.                                |
| Routing & assignment | Resolved from Dataverse control tables at submit time. Requester cannot invent chains. Optional admin-gated overrides only.                                                                             |
| Enforcement          | Prefer Dataverse security roles, column security, business rules, and sharing. Use **Power Automate** for SLA sweeps, elevation under service identity, notifications, and HTML→PDF→SharePoint publish. |
| Admin surface        | In-app **Admin** route (security-role gated) to edit document types, pools, chains, destinations, and feature flags — not hardcoded `document-types.ts` for production.                                 |
| Local play           | Keep Vite mock, but align semantics with Dataverse rules so demo behavior matches hosted behavior.                                                                                                      |
| Icons                | Switch to **`@mdi/js` + Vuetify `mdi-svg`** (tree-shakable). Drop `@mdi/font`.                                                                                                                          |
| Lint                 | Reuse `@antfu/eslint-config` shape from public repos (`redirect-newtab-ext` Vue config; `monup` lib config).                                                                                            |

### What stays in the Code App

- Inbox / workspace UX, persona filters, Markdown authoring, approval claim/decide UI.
- Reading Dataverse (and env vars) via Power Apps generated services / connectors.
- Optimistic UX only; every privileged transition must succeed against Dataverse/Flow.

### What moves out of the browser

- Approval chain materialization, assignee/pool eligibility, SLA clock ownership.
- Publish destination allowlisting and PDF binary creation.
- Audit actor identity (derived server-side).

---

## Finding → phase map

| Finding (summary)                                             | Phase   |
| ------------------------------------------------------------- | ------- |
| Client-spoofable identity / editable “Acting as”              | 2, 3    |
| Browser-supplied approval policy                              | 1, 2, 4 |
| Draft edits during review / approved without invalidate       | 1, 3    |
| Invalid decision → approve                                    | 3, 6    |
| Named SLA elevation no-op                                     | 1, 3    |
| Claim/release resets SLA indefinitely                         | 1, 3    |
| Production publish stub throws / HTML-as-PDF                  | 5       |
| User-controlled SharePoint destinations                       | 1, 4, 5 |
| Provisioning shell injection / weak idempotency / bad lookups | 1       |
| Empty approval chains accepted                                | 1, 3    |
| Power Apps context duplication / demo fallback                | 2       |
| `VITE_*` build-time vs provisioned env vars                   | 2, 6    |
| OpenAPI 3.1 nullability / weak validation                     | 6       |
| Client-controlled SLA `now`                                   | 3       |
| Invalid timestamps fail open                                  | 3       |
| Contoso approvers survive setup banner                        | 1, 4    |
| Unknown doc type → `policy` fallback                          | 1, 3    |
| Filename collisions                                           | 5       |
| `allowApproverOverride` docs drift                            | 4, 6    |
| Query refetch clobbers edits / no concurrency                 | 6, 7    |
| Typed API errors discarded                                    | 6       |
| Weak form validation / a11y / no CI/lint                      | 0, 6, 7 |
| Full MDI webfont                                              | 0       |
| Oversized workspace view / duplicated types                   | 6       |
| Concurrent TOCTOU / no CAS                                    | 3, 7    |
| No controlled document number / reader / supersession         | 8       |

---

## Phase 0 — Tooling baseline

**Status:** Implemented (see PR for phase 0+1).

**Goal:** Fast, low-risk foundation so later phases land cleanly.

### Work

1. **ESLint** from public project pattern (`josh-hemphill/redirect-newtab-ext`):
   - Add `eslint`, `@antfu/eslint-config`, `eslint-plugin-format`.
   - Root `eslint.config.js` with Vue + TypeScript, tab/semi/single-quote stylistic overrides matching that repo.
   - Scripts: `lint`, `format`, and aggregate `check` (`lint` + `typecheck` + `test`).
   - Ignore generated: `src/client/**`, `deploy/generated/**`.
2. **Tree-shakable icons**
   - Replace `@mdi/font` + `vuetify/iconsets/mdi` with `@mdi/js` + `vuetify/iconsets/mdi-svg`.
   - Register only icons used (`magnify`, `plus`, `arrow-left`, stepper set, etc.).
3. **CI scaffold** (reuse patterns from `josh-hemphill/workflows` where practical)
   - Frozen `pnpm install`, `generate:api` drift check, lint, typecheck, test, build.
4. Fix VS Code recommendations to match installed tooling.

### Exit criteria

- `pnpm lint`, `pnpm check`, and CI green on mainline.
- Production CSS/font payload no longer ships full MDI webfont.

### Out of scope

- Behavior/security changes (Phases 1+).

---

## Phase 1 — Dataverse control model & schema

**Status:** Implemented (schema, seed, provisioning hardening). Runtime engine / Admin UI remain later phases.

**Goal:** Routing, pools, destinations, and document-type policy live in Dataverse — not in bundled TS config.

### New / extended tables (publisher prefix `dr_` default)

Keep existing `document`, `approvalstep`, `historyevent`. Add control tables:

| Table                | Purpose                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `documenttype`       | Label, description, request hint, draft scaffold, default folder, active flag, policy version |
| `approvalchainstep`  | Ordered template steps per document type (named vs pool, SLA hours, role)                     |
| `approverpool`       | Named pool definition (Legal Reviewers, etc.)                                                 |
| `approverpoolmember` | Pool membership (lookup to Entra/Dataverse user or email+UPN)                                 |
| `publishdestination` | Allowed site / library / folder roots (HTTPS hosts, vanity OK)                                |
| `appsetting`         | Feature flags (e.g. allow limited chain override, collaboration mode)                         |

### Document / step field changes

- **Collaboration:** organization-friendly sharing model (prefer **user-owned + access team / share** with document-type author group, or org-owned with role-based read). Document in schema comments which model we ship.
- **Immutable SLA anchor:** `activatedueat` (or `slaDeadlineAt`) set when the step activates; claim/release **must not** move it. Optional separate `decisionDueAt` if product needs a claim window.
- **Elevation:** explicit semantics column/behavior — for named overdue steps: either convert to `pool` using `elevationPool`, or reassign to elevation queue. No silent merge into an unused `pool` field.
- **Revision:** `contentRevision` (integer) incremented on draft save; approval steps store `approvedRevision`. Submit snapshots revision; post-submit draft edits require **withdraw/revise** (invalidates steps).
- **Publish:** drop free-form site URL as the trusted path; store `publishdestination` lookup (+ optional relative folder override within allowed root). Keep requested-\* columns only as soft preferences if needed, validated against allowlist.
- Align OpenAPI/Dataverse title lengths and nullable fields to one canonical schema.

### Provisioning fixes (same phase)

- Validate connection profile with `connections.schema.json` (or runtime schema) **before** writing artifacts.
- Do not emit executable `pa-connect.sh` on validation failure; shell-quote every interpolated value (or emit arg arrays / `printf %q`).
- Fix lookup creation to use supported Dataverse relationship API sequence.
- Diff existing tables/columns on apply; only treat true duplicate codes as success; fail on incompatible metadata.

### Seed / adopter path

- Migrate current `document-types.ts` Contoso samples into **seed data** applied by provision (or documented Dataverse rows), not production defaults in the SPA bundle.
- `hasPlaceholderSharePointConfig` (or successor) must also flag sample pools/emails still present in control tables / seeds.

### Exit criteria

- `pnpm provision` generates plan including control tables + fixed lookups.
- Schema doc in `deploy/` describes collaboration + SLA fields.
- Unit tests cover quoting, schema validation failure (no write), and lookup plan shape.

---

## Phase 2 — Identity, security roles, collaborative draft access

**Status:** Implemented (identity store, principal header, mock collaboration, security roles doc).

**Goal:** Host identity + Dataverse permissions replace client-trusted emails.

### Work

1. **Single app-level identity provider**
   - One Pinia/plugin store wrapping `getContext()` (single in-flight promise).
   - States: `loading` | `hosted` | `standalone` | `failed`.
   - Demo fallback **only** in `import.meta.env.DEV` / standalone; production never silently becomes `developer@example.com`.
   - Disable identity-gated actions until resolved.
2. **Remove spoofable identity from command DTOs**
   - OpenAPI/mock (and later Dataverse mutations): drop `actorEmail` / `authorEmail` as authority; author may still be stored as a field set from principal on first claim of authorship.
   - UI: remove editable “Acting as”; show read-only current user.
3. **Dataverse security**
   - Roles sketch (names tunable): `Document Routing User`, `Document Routing Author`, `Document Routing Approver`, `Document Routing Publisher`, `Document Routing Admin`.
   - Privileges: Users create requests; Authors read/write drafts for shared records; Approvers update only eligible steps; Publishers update publish fields / trigger Flow; Admins CRUD control tables.
4. **Collaborative draft sharing**
   - On create (or type select): share document with the document-type **author collaboration** group/team so peers can open inbox “Needs draft” / shared drafts and co-edit markdown **before** submit.
   - Inbox persona: keep `needs_draft`; ensure shared drafts appear for collaborators (not only owner).
5. **Runtime config**
   - Prefer Power Apps / Dataverse environment variables (`dr_*`) over build-time `VITE_*` for hosts once hosted.
   - Document clearly: `.env` is local-only; provisioned env vars are the hosted source.

### Exit criteria

- No mutation path accepts caller-chosen actor identity.
- Two users can open the same drafting document (mock + documented Dataverse share behavior).
- Setup banner / admin health checks cover API + control-data placeholders.

---

## Phase 3 — Workflow engine (Dataverse + Power Automate)

**Status:** Implemented (approval engine semantics, mock alignment, Flow stubs under `deploy/flows/`).

**Goal:** Correct state machine, SLA, claim/release, elevation — enforced outside the SPA.

### State machine

```text
requested ⇄ drafting  →  in_review  →  approved  →  published
                ↑            │
                └─ revise ←──┤ (withdraw invalidates steps)
                             └→ rejected → (optional revise back to drafting)
```

Rules:

- Draft content updates allowed in `requested` / `drafting` only (collaborative).
- `in_review` / `approved`: content read-only unless **Withdraw & revise** (admin or author+requester policy).
- Submit materializes steps from **control tables** for the document type’s current policy version; reject empty chains.
- Decisions: runtime enum allowlist (`approve` | `reject` only); actor must be named assignee or claimer; pool claim requires membership.
- Claim/release: preserve `activatedueat`; do not extend absolute SLA by claim cycling.
- Named elevation: implement chosen semantics + tests (convert to elevated pool queue **or** reassign — pick one in implementation notes and stick to it).
- SLA processing: scheduled **Cloud Flow** (service account), not a browser-callable “pass any `now`” endpoint in production. Mock may keep a test-only clock injection behind `import.meta.env.DEV`.

### Power Automate flows (minimum set)

| Flow                | Trigger                                                                    | Responsibility                                                                                    |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| SLA sweeper         | Recurrence                                                                 | Find overdue active steps; elevate / requeue; write history                                       |
| Notify              | Step queued / elevated / decided                                           | Email/Teams to pool or assignee                                                                   |
| Publish             | When status → `approved` **or** explicit publish command by Publisher role | HTML→PDF→SharePoint using allowlisted destination; write back URL/item id; idempotent on revision |
| Optional: on submit | Status → `in_review`                                                       | Double-check chain materialization if not done in plugin                                          |

Prefer Dataverse **business rules / column constraints** for simple field locks; use Flow when timers, SharePoint, or service identity are required.

### Mock alignment

- Port the same rules into `approval-engine` + mock routes so local demo cannot regress production semantics.
- Add integration tests for mock HTTP: empty chain 400, bad decision 400, claim SLA preservation, named elevation, forbidden actor, collaborative draft GET for second user (simulated).

### Exit criteria

- Review findings 2–6, 9–10 (workflow subset), 15–16, 18 covered by tests and engine behavior.
- Documented Flow package stubs under `deploy/flows/` (JSON/zip or step-by-step) referencing table logical names.

---

## Phase 4 — Admin page (control & flow)

**Status:** Implemented (Admin UI, control APIs, mutable mock control store, SETUP rewrite).

**Goal:** Admins update routing without redeploying the Code App.

### UX

- Route: `#/admin` (hash history), nav entry visible only when user has Admin role (or DEV bypass).
- Sections (one job each):
  1. **Document types** — CRUD, scaffold template, active flag, link to default destination.
  2. **Approval chains** — ordered steps, named vs pool, SLA, elevation pool.
  3. **Pools & members** — maintain membership (search users where connector allows).
  4. **Publish destinations** — allowlisted HTTPS sites/libraries/folders.
  5. **Settings** — feature flags (`allowApproverOverride` meaning: _admin-authorized_ limited override at submit, default off); collaboration group binding.
  6. **Flow health** (read-only) — last SLA run / publish failures if stored on `appsetting` or a small `flowrun` log table (optional stretch).

### Permissions

- Non-admins: 403 / redirect home.
- Writes go to Dataverse control tables only; no client-side “save into local TS”.

### Adopter story update

- Rewrite SETUP.md: seed via Admin or provision seed, not “edit `document-types.ts`” as the primary production path. Keep TS file as **dev seed mirror** for mock-only if useful.

### Exit criteria

- Admin can change a pool member and the next submit uses the new pool without rebuild.
- `allowApproverOverride` either implemented as designed or removed from docs/config.

---

## Phase 5 — Publish path

**Status:** Implemented (allowlisted destinations, revision filenames, idempotent mock publish, no browser PDF bytes).

**Goal:** One trusted server-side publish; no browser PDF bytes; no dual-write stub.

### Work

1. Remove production dependency on `SharePointPublishService.createFile` throwing stub; DEV may keep a mock that records intent only.
2. Code App **Publish** action: sets a command flag or calls a Custom Connector / unbound action that starts the Publish Flow — or simply relies on status transition watched by Flow.
3. Flow: render HTML (from template + approved revision) → PDF → upload to allowlisted SharePoint → patch document `publishedpdfurl` / `sharepointitemid` / status `published`.
4. Filename: include document id + revision; define overwrite vs fail behavior.
5. Idempotency: republish same revision returns existing artifact; new revision creates new file or versioned name.
6. Validate destination against `publishdestination` rows; reject arbitrary site URLs from the client.

### Exit criteria

- Hosted path never uploads HTML labeled as `application/pdf` from the browser.
- Duplicate publish retries do not create conflicting uncontrolled files.

---

## Phase 6 — App & contract cleanup

**Status:** Implemented (workspace split, dirty form state, OpenAPI 3.1 null unions, typed errors, inbox a11y, catch-all route, production `/api` fail-loud).

**Goal:** Thin, correct Vue app over the new model; contract matches runtime.

### Work

1. Split `DocumentWorkspaceView` into draft / approval / publish / history panels + composables.
2. Separate server snapshot vs editable form state; dirty guard; hydrate on load/reset only.
3. Typed error helper for HeyAPI / Dataverse failures.
4. OpenAPI 3.1 null unions; security schemes; `400`/`401`/`403`/`409` responses; regenerate client.
5. Prefer generated DTO types over duplicated domain unions where practical.
6. Form validation aligned to schema (title length, email, destination pickers from allowlist).
7. Inbox row keyboard accessibility (`RouterLink` / proper row semantics).
8. Wire runtime env bootstrap; fail loud if production still points at `/api` without mock.
9. Catch-all route + document load error recovery actions.

### Exit criteria

- OpenAPI ↔ mock ↔ Dataverse field parity documented/tested.
- No refetch clobber of in-progress draft edits during unrelated mutations.

---

## Phase 7 — Hardening, tests, observability

**Status:** Implemented (e2e mock workflow, claim/decide races, schema drift checks, coverage thresholds, CAS notes, Flow health seed, bundle budget).

**Goal:** Lock the routing → approve → publish model against regressions before adding controlled-document product surface (Phase 8).

### Work

1. **End-to-end mock integration test**
   - One happy path: create → collaborative draft (second actor) → submit → claim → decide → (optional SLA elevate) → publish.
   - Assert status transitions, `contentRevision` / `publishedContentRevision`, history actions, and idempotent republish.
2. **Concurrency / CAS notes + tests**
   - Document Dataverse row-version / `If-Match` (or equivalent) strategy in `deploy/SCHEMA.md`.
   - Mock tests for claim race (second claimer → 409) and double decide (second decide → 409).
   - UI: surface `409` clearly via existing `getApiErrorMessage` (no silent refetch clobber — already Phase 6).
3. **Provisioning hardening tests**
   - Dry-run / plan-diff coverage for schema drift (new columns refuse incompatible types).
   - Keep quoting + connection-schema validation green under `pnpm check`.
4. **Coverage thresholds**
   - Vitest coverage for `src/domain/`, `src/mock/approval-engine.ts`, `src/publishing/publish-engine.ts`, provisioning quoting/validation.
   - Wire into `pnpm check` / CI (fail under threshold).
5. **A11y**
   - Enable progressive Vue a11y rules where cheap; add optional axe smoke on inbox + admin (+ published reader once Phase 8 lands).
6. **Bundle budget**
   - CI check that production CSS/JS stay under a documented gzip budget (icons already tree-shaken).
7. **Flow health observability**
   - Ensure Admin Flow health panel has enough mock/seed failure rows to demo; document how hosted Flow writes `flowrun` rows.
   - No new telemetry vendor — stick to Dataverse/`flowrun` + Admin UI.

### Explicitly out of scope here

- Document numbers, library/reader UX, supersession (Phase 8).
- Dataverse C# plugins (still deferred).

### Exit criteria

- `pnpm check` enforces coverage thresholds for the packages above.
- Claim/decide race behaviors tested; concurrency strategy documented.
- Review backlog items either fixed or moved to Deferred / Phase 8 with rationale.

---

## Phase 8 — Controlled documents (numbers, reader, supersession)

**Status:** Implemented.

**Goal:** Treat a **published** artifact as an immutable controlled document: human-facing number, read-only presentation, and supersession via a **new** case — never in-place edit of a published final.

### Product rules (locked for this phase)

| Rule         | Choice                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Immutability | `published` content and metadata that define the controlled artifact are read-only. No draft PUT, no withdraw-and-revise from `published`.  |
| Change path  | **Supersede** creates a new document case linked to the prior published record; old record becomes `superseded`.                            |
| Numbering    | Assign a **document number** at first successful publish (not at request). Format is per document type.                                     |
| Presentation | Dedicated read-only **published document** page (and a library list). Workspace remains the routing/authoring surface.                      |
| SharePoint   | PDF remains the file-of-record in the allowlisted library; the app is the registry + reader chrome, not a second source of truth for bytes. |

### State machine extension

```text
requested ⇄ drafting  →  in_review  →  approved  →  published  →  superseded
                ↑            │              │
                └─ revise ←──┴──────────────┘   (withdraw: not from published)
                             └→ rejected → (optional revise)

supersede(published A) → new case B (requested/drafting)
  B.supersedes = A
  A stays published until B publishes, then A → superseded (A.supersededBy = B)
```

**Timing of A → superseded:** Prefer **on B’s successful publish** (A remains the current controlled doc until the replacement is live). Reject a second concurrent supersede while B is still open (or allow only one open successor).

### Schema / control model

**Document (case) fields**

| Field                    | Purpose                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `documentNumber`         | Human id, e.g. `POL-2026-00042` (null until first publish)                                       |
| `documentVersion`        | Controlled version integer starting at `1` on first publish; successor publishes get `prior + 1` |
| `supersedesDocumentId`   | Lookup/UUID of the document this case replaces (set on supersede create)                         |
| `supersededByDocumentId` | Set on the prior doc when successor publishes                                                    |
| `publishedAt`            | First (or this version’s) publish instant                                                        |
| `status`                 | Add `superseded` to `DocumentStatus`                                                             |

**Document type / settings**

| Field                                                         | Purpose                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `numberPrefix`                                                | e.g. `POL`, `SOP`                                                 |
| `numberPattern`                                               | Template, default `{prefix}-{yyyy}-{seq:5}`                       |
| `nextSequence` **or** separate `documentnumbersequence` table | Atomic sequence per type (Dataverse); mock uses in-memory counter |

**Filename:** Keep revision-safe PDF names; optionally include `documentNumber` + `documentVersion` once assigned (`{number}-v{version}.pdf` or keep id+contentRevision for storage uniqueness and show number in UI).

### API / Flow

1. **Publish (extend Phase 5)**
   - If first publish: allocate number + `documentVersion = 1`.
   - If republish same `contentRevision`: still idempotent (no new number/version).
   - If this case `supersedes` another and publish succeeds: mark prior `superseded`, set `supersededByDocumentId`, copy forward number, bump `documentVersion`.
2. **`POST /documents/{id}/supersede`**
   - Allowed when status is `published` and no open successor exists.
   - Creates new case: copies type, title suggestion (“… (revision)”), freeform seed, collaboration shares; sets `supersedesDocumentId`; status `drafting` or `requested`.
   - Does **not** copy approval steps (new chain materializes on submit from current control tables).
3. **`GET /library` (or filter on list)**
   - List current controlled docs (`published` only by default; optional include `superseded`).
   - Search by number, title, type.
4. **`GET /documents/by-number/{documentNumber}`**
   - Resolves the **current** published version (not superseded), or 404.

### App UX

1. **Library** — `#/library` (nav for authenticated users): table of current published docs (number, title, type, version, published date).
2. **Published reader** — `#/library/:documentNumber` or `#/documents/:id/published`:
   - Brand/number/version, status chip, link to PDF, supersession trail (prior/next), metadata.
   - No draft editors; CTA **Supersede** (author/admin policy) when status is `published`.
3. **Workspace**
   - If `published`: hide draft save; show link “View published document”; show supersede instead of withdraw.
   - If case is a successor in progress: banner “Superseding {number} v{n}”.
4. **Admin**
   - Document type: edit `numberPrefix` / pattern; show next sequence (read-only or adjust with audit caution).

### Permissions

- Library/reader: any Document Routing User who can read published org docs (tighten later with Dataverse table perms).
- Supersede: requester/author/collaborator on the published doc, or Admin (mirror withdraw actor set unless product says Admin-only).
- Number allocation: server/Flow only — never client-supplied `documentNumber`.

### Mock alignment

- Sequence allocator in control store; publish assigns number; supersede endpoint + status transition tests.
- Integration: publish A → supersede → draft/submit/approve/publish B → A `superseded`, B has same number and version+1.

### Exit criteria

- Published content cannot be edited or withdrawn in place.
- First publish assigns a stable document number; superseding publish keeps the number and increments version.
- Library + reader pages show current finals; superseded docs remain reachable read-only with clear lineage.
- OpenAPI + mock + schema doc describe the new fields and statuses.

### Out of scope (later / deferred)

- Full records-management retention labels, legal hold, external public anonymous reader.
- Branching multiple simultaneous drafts of the same number (one open successor only).
- Auto-migrate historical published cases without numbers (optional backfill script if needed).

---

## Suggested implementation order

```text
Phase 0 (tooling)
    ↓
Phase 1 (schema + provisioning)  ←── enables Admin & Flows
    ↓
Phase 2 (identity + sharing)     ←── safe collaboration
    ↓
Phase 3 (engine + Flows)         ←── correct approvals/SLA
    ↓
Phase 4 (Admin UI)               ←── org self-service
    ↓
Phase 5 (Publish Flow)           ←── real SharePoint PDFs
    ↓
Phase 6 (app/contract polish)
    ↓
Phase 7 (hardening)              ←── lock routing model
    ↓
Phase 8 (controlled documents)   ←── numbers, reader, supersede
    ↓
Phases 9–13                      ←── see post-phase-8-review-roadmap.md
```

Phases 0 and 1 can proceed in parallel after the schema sketch is agreed. Phase 4 can start UI shell against mock control APIs as soon as Phase 1 table shapes exist. Phase 8 depends on Phase 5 publish semantics and benefits from Phase 7 coverage so supersession does not regress claim/publish races. After Phase 8, continue with [`post-phase-8-review-roadmap.md`](./post-phase-8-review-roadmap.md).

---

## PR / delivery slicing

Ship as stacked PRs (one phase per PR unless a phase is tiny):

| PR  | Title focus                                               |
| --- | --------------------------------------------------------- |
| 0   | ESLint (antfu), MDI SVG icons, `pnpm check`, CI           |
| 1a  | Dataverse control schema + SLA/revision fields            |
| 1b  | Provisioning validation, quoting, lookup/idempotency      |
| 2   | Identity store, strip actor spoofing, draft sharing rules |
| 3a  | Workflow engine + mock tests (SLA/elevation/decisions)    |
| 3b  | Flow stubs + deploy docs                                  |
| 4   | Admin page + SETUP rewrite                                |
| 5   | Publish orchestration via Flow                            |
| 6   | Workspace split, OpenAPI 3.1, a11y/errors                 |
| 7   | Coverage thresholds, concurrency notes, e2e mock path     |
| 8a  | Schema + number allocation + supersede API/mock           |
| 8b  | Library + published reader UI + Admin number settings     |

---

## Deferred / non-goals (unless pulled in)

- Full Dataverse plugin (C#) development — prefer Flow + security roles for this example unless a plugin becomes necessary for atomic transitions (number allocation / supersede publish may force a plugin or tightly transactional Flow if Dataverse alone races).
- Replacing Vue/Vuetify or abandoning the local mock.
- Multi-tenant SaaS billing / cross-environment promotion tooling beyond provision scripts.
- Turning on Vue a11y ESLint rules at error level in Phase 0 (enable progressively in Phase 6–7; `redirect-newtab-ext` currently sets `vue.a11y: false`).
- Records retention / legal hold / anonymous public portal (called out under Phase 8 out of scope).

---

## Open choices

### Confirmed from earlier phases

1. **Collaboration model:** user-owned + share with type’s author team.
2. **Named-step elevation:** convert overdue named step to elevated pool queue.
3. **Publish trigger:** explicit Publish button for publishers (Flow on demand) plus status guard.
4. **Approver identity store:** systemuser lookups with email denormalized for inbox filters (mock still email-first).

### Confirm at Phase 8 kickoff

1. **Number format:** default `{prefix}-{yyyy}-{seq:5}` per type vs org-global single sequence. **Locked:** per-type sequence with type prefix.
2. **Supersede actor:** same set as withdraw (requester/author/collaborator) vs Admin-only. **Locked:** same actors as withdraw plus Admin.
3. **When prior becomes superseded:** on successor **publish** (recommended) vs when supersede is opened. **Locked:** on successor publish.
4. **Library visibility:** all authenticated app users vs Publishers/Admins only for superseded history. **Locked:** all authenticated users see current library; superseded via `includeSuperseded` / lineage.

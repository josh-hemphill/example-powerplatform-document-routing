# Post–Phase 8 review roadmap

Findings from the August 2026 codebase + UI review, after Phases 0–8 of [`remediation-roadmap.md`](./remediation-roadmap.md) were implemented. This document retains **bugs**, **UI/UX gaps**, and **design rationale** so work can be sliced and tracked without losing context.

**Scope:** Mock/API correctness that still matters for hosted semantics, identity/authz hardening, controlled-document edge cases, and enterprise UI polish. Not a rewrite of the Vue shell.

**Suggested order:** Phase 9 → 10 → 11 → 12 → 13. Phases 11–12 can overlap after 9–10 land enough capability flags; Phase 13 is polish and can trail.

---

## Finding → phase map

| Finding (summary)                                                 | Severity    | Phase |
| ----------------------------------------------------------------- | ----------- | ----- |
| Hosted identity hardcodes publisher (all roles except admin)      | Critical    | 9     |
| `process-sla` unauthenticated document read/mutate (IDOR)         | Critical    | 9     |
| Publish authorization is role-only (no case membership)           | Critical    | 9     |
| Host context timeout → demo Admin principal / no retry            | High        | 9     |
| Admin role never assigned hosted; router has no admin guard       | High        | 9     |
| Client role headers are mock authz (must not ship as real)        | High        | 9     |
| `allowApproverOverride` lets any submitter invent the chain       | High        | 10    |
| Approval chain runs in JSON array order, ignoring `order`         | High        | 10    |
| No way to abandon an open supersede successor                     | High        | 10    |
| Concurrent draft edits: last write wins                           | High        | 10    |
| Idempotent / non-idempotent publish `publishedAt` wrong           | Medium      | 10    |
| PUT publish destination skips HTTPS validation                    | Medium      | 10    |
| Create still accepts free-form SharePoint URLs                    | Medium      | 10    |
| Draft summary / whitespace body not enforced server-side          | Medium      | 10    |
| Rejected cases readable by unused future approvers                | Medium      | 10    |
| Document number sequence does not reset per year                  | Medium      | 10    |
| UI capability flags omit collaboration checks                     | Medium      | 10    |
| Named SLA with no elevation pool never escalates                  | Low         | 10    |
| Supersede copies prior `contentRevision`                          | Low         | 10    |
| Approval action strip: 6 peers, no confirm, SLA beside decide     | High (UX)   | 11    |
| No snackbars; sticky non-dismissible success alerts               | Medium (UX) | 11    |
| No confirmation for Reject / Withdraw / Publish / Supersede       | High (UX)   | 11    |
| Workspace shows all stages disabled (weak progressive disclosure) | Medium (UX) | 11    |
| Inbox missing from primary nav; Library duplicated                | Medium (UX) | 12    |
| Global tagline under every page H1; shell “Document” title        | Medium (UX) | 12    |
| Inbox persona auto-switch fights manual choice                    | Medium (UX) | 12    |
| Crowded app bar / no mobile drawer; tables not mobile-friendly    | Medium (UX) | 12    |
| Inconsistent primary CTA alignment; status enum vs labels         | Low (UX)    | 12    |
| Admin JSON textareas; empty states; a11y gaps                     | Medium (UX) | 13    |

---

## Design references (for UI phases)

Retain these citations when implementing Phases 11–13 so UX decisions stay grounded:

| Principle                                                  | Source                                                              | Application here                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Visibility of system status; error prevention; consistency | Nielsen, _10 Usability Heuristics for User Interface Design_ (NN/g) | Toasts, confirms, status labels, nav consistency                 |
| Affordances, feedback, gulf of evaluation                  | Norman, _The Design of Everyday Things_                             | Post-action feedback; page-specific signifiers vs static tagline |
| Decision time vs number of choices                         | Hick–Hyman law                                                      | Collapse/group approval actions                                  |
| Target size & distance → error rate                        | Fitts’s law                                                         | Separate Approve vs Reject; touch targets on mobile              |
| Proximity / similarity grouping                            | Gestalt principles                                                  | Claim/release vs decide vs revise clusters                       |
| Progressive disclosure                                     | Nielsen Norman Group                                                | Hide inactive workspace stages; secondary ops behind menus       |
| Consistency; reduce short-term memory load                 | Shneiderman, _Eight Golden Rules_ / _Designing the User Interface_  | CTA alignment; structured Admin editors                          |
| Dialogue principles (suitability for task)                 | ISO 9241-110                                                        | Show only task-relevant controls                                 |
| Status messages; target size                               | WCAG 2.2 (4.1.3, 2.5.5)                                             | Live regions for alerts; touch-friendly controls                 |
| Adaptive navigation & density                              | Microsoft Fluent design guidance                                    | App-bar collapse / drawer; list alternatives for tables          |

---

## Phase 9 — Hosted identity & authorization

**Status:** Implemented.

**Goal:** Hosted builds never grant publisher/approver by default; privileged endpoints require real principals and case access; demo identity cannot leak into a live host.

### Work

1. **Resolve roles from Dataverse / security roles**
   - Stop hardcoding `['user','author','approver','publisher']` on successful `getContext()` (`src/stores/identity.ts`).
   - Default hosted users to `user` (or empty) until roles load; map `Document Routing Admin` → `admin`, etc. (see `deploy/SECURITY_ROLES.md`).
2. **Host context load reliability**
   - Do **not** fall back to demo Admin on timeout while running inside Power Apps.
   - Allow retry after `failed`; clear stuck `loadPromise`.
   - Keep demo personas DEV/standalone-only (`allowsDemoIdentityFallback`).
3. **Router + Admin gating**
   - `meta.requiresAdmin` + `beforeEach`; do not rely on view-only redirect.
4. **Publish authorization**
   - Require publisher/admin **and** case access (or explicit publish-queue membership)—not UUID + role alone.
5. **SLA processing**
   - Restrict `POST …/approvals/process-sla` to service/admin identity.
   - Do not return full document body to arbitrary callers; omit or redact if needed for Flow callbacks.
   - Hide/remove end-user “Process SLA” in production UI (dev/admin flag only).
6. **Role headers**
   - Document clearly: `X-Document-Routing-Roles` is **mock-only**.
   - Any future “real” API **must ignore** client role headers and derive from caller principal.

### Exit criteria

- Hosted identity never implies publisher without a mapped security role.
- Non-service actors cannot process SLA or publish documents they cannot access.
- Admin route is guarded; hosted Admin role can be granted via security roles.
- Tests cover: hosted default roles, timeout without demo fallback when not DEV, publish/SLA forbidden paths.

### Out of scope

- Full Dataverse plugin development.
- Changing collaboration share model (Phase 2 locked).

---

## Phase 10 — Workflow correctness & concurrency

**Status:** Implemented.

**Goal:** Chain order, override, supersede lifecycle, draft CAS, and publish/destination validation match the intended product rules—and stay tested in the mock.

### Work

1. **Approval chain `order`**
   - Sort by `order` at materialize/submit; require contiguous `1..n` in `validateChain`.
   - Admin UI / API reject gapped or array-mismatched sequences.
2. **`allowApproverOverride`**
   - Accept client `body.steps` only when actor is Admin (or a dedicated capability), regardless of the flag.
   - Align Admin settings copy with enforcement.
3. **Draft concurrency**
   - Require `expectedContentRevision` (or If-Match); return `409` on mismatch.
   - UI: surface conflict; allow reload when form is clean; never silent last-write-wins.
4. **Supersede abandon**
   - Add cancel/abandon for open successors stuck in `drafting` / `in_review` / `approved` (non-published).
   - Keep “one open successor” rule; abandoned statuses no longer block a new supersede.
5. **Publish timestamps**
   - Idempotent response uses `document.publishedAt`.
   - Non-idempotent path stamps once and reuses that value in response + record.
6. **Destinations & create payload**
   - HTTPS validation on PUT destinations (same as POST).
   - Drop or ignore free-form SharePoint URLs on create for the trusted publish path; prefer allowlist-only helpers.
7. **Draft validation (server)**
   - Enforce summary max length; reject whitespace-only body (align with `form-rules.ts`).
8. **Access after reject**
   - Limit step-based read access to activated/completed steps, or clear waiting steps on reject—so unused future approvers do not retain draft access.
9. **Document numbers**
   - Sequence keyed by year (or reset on year change) so `{yyyy}` does not produce `POL-2027-00100` after `POL-2026-00099`.
10. **Capability flags**
    - Gate `canDraft` / `canSubmitApproval` with `canActorEditDraft` / mutate helpers, not status alone.
11. **Small follow-ups**
    - Reset successor `contentRevision` on supersede open (or document intentional continuity).
    - Named SLA without elevation pool: document as intentional **or** notify/reassign/fail closed.

### Exit criteria

- Tests: sorted chain execution, override forbidden for non-admin, draft `409`, abandon successor, HTTPS on destination PUT, year-scoped numbers.
- OpenAPI updated for new fields/errors (`expectedContentRevision`, abandon endpoint, etc.).

### Out of scope

- Multiple simultaneous successors for one number (still deferred).
- Browser-side PDF generation.

---

## Phase 11 — Approval actions, feedback & progressive disclosure

**Status:** Planned.

**Goal:** Approval and irreversible actions follow error-prevention and progressive-disclosure practice; feedback closes Norman’s gulf of evaluation without sticky alert clutter.

### Work

1. **Group approval actions** (`ApprovalPanel.vue`)
   - Cluster by Gestalt proximity: **queue** (Claim / Release) · **decide** (Approve / Reject) · **revise** (Withdraw).
   - Move Process SLA behind admin/dev only (Phase 9); never peer with Approve.
2. **Confirm destructive / irreversible ops**
   - Dialogs for Reject, Withdraw & revise, Publish PDF, Supersede.
   - Keep Fitts separation: primary Approve distinct from tonal/error Reject (spacing or divider).
3. **Feedback**
   - Dismissible toasts/snackbars for success; auto-clear.
   - Sticky alerts only for blocking errors that need Retry.
   - Announce status via polite live region where practical (WCAG 4.1.3).
4. **Progressive disclosure on workspace**
   - Collapse or summarize inactive stages; expand the active stage + compact `WorkflowTimeline`.
   - Prefer disable-within-active-stage over a long scroll of dead panels.

### Design rationale (retain)

- Nielsen: _Error prevention_, _Visibility of system status_, _User control and freedom_.
- Hick–Hyman: fewer equally salient choices → faster, safer decisions.
- Fitts: risky targets should not share the same row density as routine ones.
- NN/g progressive disclosure: advanced/secondary ops behind disclosure, not the default strip.

### Exit criteria

- No irreversible workspace action without confirmation.
- SLA control not visible to normal approvers in production builds.
- Success feedback is transient; workspace shows one primary stage of work at a time.

---

## Phase 12 — Navigation, hierarchy & responsive shell

**Status:** Planned.

**Goal:** Information architecture matches the product hub (Inbox), page hierarchy is local to the route, and the shell works on narrow viewports.

### Work

1. **Primary navigation**
   - Add **Inbox** as a first-class app-bar (or nav-drawer) item.
   - Remove duplicate Library control from the page-header row when already in the app bar.
2. **Page hierarchy**
   - Replace global tagline under every H1 with route-specific subtitle (or omit when redundant).
   - Document workspace: shell title should reflect document title/number, or defer to `WorkspaceHeader` only (avoid competing “Document” H1).
3. **Inbox personas**
   - Auto-select actionable persona **once** on first load / identity change—not on every list refetch.
   - Surface persona `description` (tooltip or helper text) from `inbox-personas.ts`.
4. **Responsive shell**
   - Collapse app-bar actions into a drawer/menu on small breakpoints.
   - Provide list/card alternatives (or horizontal-scroll affordance with sticky first column) for Inbox/Library tables.
5. **Consistency polish**
   - Align primary CTA edge (typically trailing in LTR) across New request, Draft, Publish, Admin.
   - Humanize `ApprovalStepper` status tokens to match `DocumentStatusChip` language.
   - Unify Supersede button copy across published reader and workspace.
   - Mark current route (`aria-current` / active styles) on nav controls.

### Design rationale (retain)

- Nielsen _Match between system and real world_ / _Consistency_: Inbox is the hub; treat it as such.
- Norman: signifiers should reflect **current** context—not a static pipeline slogan on Admin/404.
- Fluent adaptive layouts + WCAG target size: touch-first collapse of dense chrome.

### Exit criteria

- Inbox reachable from primary nav on every page.
- Persona choice stays stable across background refetches.
- Narrow viewport: no overflowing app bar; tables usable without unbroken multi-column crush.

---

## Phase 13 — Admin editors, empty states & accessibility

**Status:** Planned.

**Goal:** Admin remains powerful but safer; empty/loading/error patterns and a11y catch up with inbox/workspace quality.

### Work

1. **Admin structured editors**
   - Replace raw JSON textareas for approval chains / pool members with ordered step and member editors (JSON import/export as expert escape hatch only).
   - Unsaved-change warning; sticky save where forms are long.
2. **Empty & error states**
   - Flow health empty table; History panel with no events; Retry on Inbox/Library errors (parity with workspace).
3. **Accessibility**
   - Skip link; focus-visible rings on Library links (parity with Inbox).
   - Label stepper/timeline for assistive tech (decorative vs interactive clarity).
   - Optional axe smoke on inbox, admin, library, published reader (extends Phase 7 intent).
4. **Row interaction clarity**
   - Inbox/Library: either make full row clickable or remove hover that implies it when only the title link works.

### Design rationale (retain)

- Shneiderman: reduce short-term memory load—structured fields over free JSON for policy data.
- Nielsen _Help users recover from errors_: empty states with next action; Retry everywhere lists can fail.
- WCAG 2.2: keyboard focus visibility, name/role/value for custom steppers.

### Exit criteria

- Admin can edit a chain without hand-writing JSON for the happy path.
- No silent empty tables; list error → Retry.
- Basic axe smoke green on primary routes (or documented waivers).

---

## Suggested implementation order

```text
Phase 9  (identity & authz)          ←── stop over-grant / IDOR
    ↓
Phase 10 (workflow & concurrency)    ←── correct engine semantics
    ↓
Phase 11 (approval UX & feedback)    ←── safe decide / irreversible ops
    ↓
Phase 12 (nav, hierarchy, responsive)
    ↓
Phase 13 (admin editors & a11y)
```

Phases 11 and 12 may proceed in parallel after Phase 9 hides SLA from end users and Phase 10 exposes any new abandon/conflict APIs the UI needs.

---

## PR / delivery slicing

| PR  | Title focus                                                        |
| --- | ------------------------------------------------------------------ |
| 9a  | Hosted role resolution + identity retry/timeout hardening          |
| 9b  | Publish case-access check; SLA service-only; hide Process SLA      |
| 9c  | Admin router guard + hosted admin role mapping                     |
| 10a | Chain `order` sort/validate; override admin-only                   |
| 10b | Draft `expectedContentRevision` + UI conflict                      |
| 10c | Supersede abandon; number year sequence; publish/destination fixes |
| 11  | Approval action groups, confirms, toasts, stage disclosure         |
| 12  | Inbox nav, persona stability, responsive shell, hierarchy          |
| 13  | Admin structured editors, empty states, a11y smoke                 |

---

## Deferred / non-goals (unless pulled in)

- C# Dataverse plugins (unless number allocation / supersede-publish races force them).
- Records retention, legal hold, anonymous public reader.
- Multiple open successors per controlled number.
- Replacing Vuetify or abandoning the local mock.
- Turning Vue a11y ESLint to error for the whole app in one shot (enable progressively with Phase 13).

---

## Relationship to earlier roadmap

Phases **0–8** in [`remediation-roadmap.md`](./remediation-roadmap.md) remain the historical plan (tooling → schema → identity → engine → admin → publish → polish → hardening → controlled documents). **This document starts at Phase 9** and does not reopen locked Phase 8 product rules except where bugs show incomplete enforcement (abandon successor, year-scoped sequences, publish timestamps).

# Post–Phase 13 review roadmap

Findings from the August 2026 **fresh** codebase review (bugs, performance, UI/UX) after Phases 0–13 were implemented. This document retains **correctness**, **performance**, and **design** findings so work can be sliced without losing context.

**Scope:** Client form/state races, capability vs AuthZ alignment, mock AuthZ fidelity, list/query performance, and enterprise UI polish on top of the Phase 11–13 shell. Not a rewrite of the Vue app or a reopening of locked Phase 8–10 product rules except where enforcement gaps remain.

**Suggested order:** Phase 14 → 15 → 16 → 17. Phases 16–17 can overlap after 14–15 land dirty-state and AuthZ fixes.

**Status:** Phases **14–17** implemented (see stacked PRs).

**Preceding roadmap:** [`post-phase-8-review-roadmap.md`](./post-phase-8-review-roadmap.md) (Phases 9–13). Historical Phases 0–8: [`remediation-roadmap.md`](./remediation-roadmap.md).

---

## Finding → phase map

| Finding (summary)                                                       | Severity      | Phase |
| ----------------------------------------------------------------------- | ------------- | ----- |
| Admin selection guard re-hydrates on list refetch and wipes dirty edits | Critical      | 14    |
| Document workspace has no leave/unload guard; dirty drafts lost         | High          | 14    |
| Submit-for-approval ignores unsaved draft edits                         | High          | 14    |
| Approval/decision comments cleared on every clean hydrate               | High          | 14    |
| Mutation `onSettled` invalidates using live `documentId` (stale-nav)    | Medium        | 14    |
| Confirm-dialog singleton cancels in-flight confirms                     | Medium        | 14    |
| Draft Save / New request double-submit while loading                    | High          | 14    |
| `canPublish` UI omits case-access check required by server              | High          | 15    |
| Mock AuthZ trusts client `X-Document-Routing-Roles` header              | High          | 15    |
| Elevation-pool members get case access before SLA elevation             | Medium        | 15    |
| Inbox list includes published/superseded for every authenticated user   | Medium        | 15    |
| `ready_to_publish` persona not filtered by publish AuthZ                | Medium        | 15    |
| Hosted roles fail closed silently → false “not admin”                   | Medium        | 15    |
| Identity `Promise.race` can leave unhandled `getContext` rejections     | Medium        | 15    |
| Release route does not assert active step / `in_review`                 | Medium        | 15    |
| Inbox search refetches on every keystroke (Library is debounced)        | High (perf)   | 16    |
| Inbox/Library dual-mount mobile+desktop lists; no virtualization        | High (perf)   | 16    |
| List APIs return unbounded result sets                                  | High (perf)   | 16    |
| Draft typing re-renders full history timeline via `draft-preview`       | High (perf)   | 16    |
| Aggressive Colada `staleTime` + broad list invalidation on every mutate | Medium (perf) | 16    |
| Persona filter is client-only after downloading full inbox              | Medium (perf) | 16    |
| Admin dirty detection `JSON.stringify`s whole form each edit            | Medium (perf) | 16    |
| Validation rule factories allocate new arrays in templates              | Medium (perf) | 16    |
| Document workspace keeps all stage panels mounted when collapsed        | Medium (perf) | 16    |
| Per-row type-label `find` + `toLocaleString` in list templates          | Medium (perf) | 16    |
| Document / published views lack page-level H1                           | High (UX)     | 17    |
| Primary nav not a labeled landmark; skip-link target weak vs fixtures   | High (UX)     | 17    |
| Failed identity chip is a non-button interactive control                | High (UX)     | 17    |
| Inconsistent success/error feedback (toast vs alert vs missing role)    | High (UX)     | 17    |
| Workspace first viewport is multi-job clutter                           | Medium (UX)   | 17    |
| Inbox chrome before the work list; dual filter systems                  | Medium (UX)   | 17    |
| Empty states are passive (no recovery CTA)                              | Medium (UX)   | 17    |
| Confirm dialog missing `aria-labelledby` / `aria-describedby`           | Medium (UX)   | 17    |
| Tables lack captions; some headers missing `scope`                      | Medium (UX)   | 17    |
| Almost no expand/collapse motion on stage panels                        | Medium (UX)   | 17    |
| Published reader shows raw type id; weak reading structure              | Medium (UX)   | 17    |
| Brand tagline unused; outer cards on simple forms                       | Low (UX)      | 17    |

---

## Design references (for UI / perf phases)

| Principle                                                  | Source                                       | Application here                                                      |
| ---------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| Visibility of system status; error prevention; consistency | Nielsen, _10 Usability Heuristics_           | Dirty guards, submit-after-save, unified toast/alert channels         |
| Affordances & feedback                                     | Norman, _The Design of Everyday Things_      | Identity retry as a real button; empty-state CTAs                     |
| Progressive disclosure                                     | Nielsen Norman Group                         | One primary workspace stage; demote secondary chrome                  |
| Consistency; reduce short-term memory load                 | Shneiderman, _Eight Golden Rules_            | Same feedback pattern across workspace/admin/new request              |
| Status messages; name/role/value; landmarks                | WCAG 2.2 (1.3.1, 2.4.1, 2.4.6, 4.1.2, 4.1.3) | H1 per view, labeled `nav`, captioned tables, dialog labeling         |
| Perceived performance                                      | RAIL / Chrome performance guidance           | Debounce search; virtualize lists; isolate draft preview from history |
| Adaptive density                                           | Microsoft Fluent                             | Collapse inbox filters; expansion transitions                         |

---

## Phase 14 — Form state, dirty guards & mutation races

**Status:** Implemented.

**Goal:** Unsaved edits never disappear silently; submit and navigate paths respect draft dirtiness; mutation cache invalidation stays tied to the document that was acted on.

### Work

1. **Admin selection guard: skip hydrate when selection is unchanged and dirty**
   - `use-admin-selection-guard.ts` watches `[selectedId, items]` and always `hydrate`s when `items` refreshes.
   - Skip hydrate when `nextId === previousId` and dirty; only hydrate on real selection change, first load, or explicit post-save refresh.
   - Optionally compare entity identity/version before overwriting a clean form.

2. **Workspace leave / document-switch guards**
   - Mirror `AdminView.vue`: `onBeforeRouteLeave` + `beforeunload` when `isDirty`.
   - Confirm before switching `documentId` while dirty (`use-document-form-state` currently hydrates on document switch without confirm).

3. **Submit-for-approval must not freeze stale server draft**
   - Disable Submit when `isDraftDirty`, **or** auto-save then submit.
   - Prefer also requiring `expectedContentRevision` on submit server-side (aligns with Phase 10 draft concurrency).

4. **Preserve in-progress approval/decision comments across soft refetch**
   - `hydrateFromDocument` clears `approvalForm.comment` / `decisionForm.comment` even when only draft/publish dirty is tracked.
   - Track comment dirty, or clear comments only after successful submit/decide, or skip comment reset on soft refetch.

5. **Capture document id for mutation settle invalidation**
   - `invalidateDocumentQueries` uses live `documentId.value`; navigate mid-flight invalidates the wrong cache entry.
   - Capture `id` at mutation start; invalidate that id in `onSettled`. Ignore/abort results if the route id changed.

6. **Confirm dialog queue or overlap policy**
   - Second `confirm()` resolves the first as `false` (`use-confirm-dialog.ts`).
   - Queue dialogs, or reject overlapping confirms explicitly.

7. **Disable primary actions while mutations are in flight**
   - New request submit, draft Save, Submit approval: include `isLoading` / mutation flags in `:disabled` (loading alone does not block clicks).

### Exit criteria

- Dirty Admin edit survives control-list refetch without discard dialog.
- Leaving a dirty workspace prompts; discard is explicit.
- Submit while dirty is impossible or saves first.
- Double-click create/save does not create duplicate cases or revision conflicts.
- Tests cover selection-guard hydrate skip, workspace leave guard, and submit-when-dirty.

---

## Phase 15 — AuthZ fidelity & access edges

**Status:** Implemented.

**Goal:** UI capability flags match server AuthZ; mock derives roles from the actor (not spoofable headers); list/persona filters do not over-expose cases.

### Work

1. **Align `canPublish` with `canActorPublishDocument`**
   - UI currently checks publisher/admin role + destination only (`use-workspace-capabilities.ts`).
   - Server requires role **and** `canActorAccessDocument` (`document-authz.ts`, `publish.ts`).
   - Gate Publish with the same helper inputs the mock uses.

2. **Mock AuthZ: derive roles from actor email**
   - Comments in `fetch-principal.ts` say the server must derive roles; mock still uses `readActorRoles(req)` for admin/publish/SLA.
   - Use `resolvePrincipalRolesByEmail(actor)` (or principal store lookup) for authorization; treat Roles header as display-only or drop it for AuthZ.

3. **Elevation pool access only after elevation**
   - `canActorAccessDocument` counts `elevationPool` members on active steps before `elevated === true`.
   - Only grant access via elevation pool when the step is elevated (or equivalent).

4. **Keep published/superseded out of the work inbox**
   - Access helper returns true for any authenticated user on published/superseded; `GET /api/documents` therefore floods Inbox “All”.
   - Exclude those statuses from the case list (library remains `/api/library`).

5. **Persona `ready_to_publish` respects publish AuthZ**
   - Filter with `canActorPublishDocument` (or publisher/admin + access), not status alone.

6. **Hosted role load failure UX**
   - `refreshHostedRoles` swallows errors; Admin guard treats unresolved as non-admin.
   - Surface retry; distinguish “loaded user-only” vs “roles unresolved”; avoid hard redirect when roles never resolved.

7. **Identity race: no unhandled rejection after timeout**
   - Attach `.catch` on `getContext()` in the `Promise.race`, or ignore late rejection after timeout wins.

8. **Release route: same active-step + `in_review` checks as claim/decide**

### Exit criteria

- Publisher without case access never sees Publish enabled.
- Forging Roles header cannot grant mock admin/publish.
- Inbox “All” is a work queue, not a library dump.
- Transient `/principal` failure offers retry instead of silent lockout.
- AuthZ unit tests cover elevation-before-access and publish UI/server parity.

---

## Phase 16 — List & query performance

**Status:** Implemented.

**Goal:** Typing and scrolling stay responsive at hundreds of documents; network and main-thread work scale with page size, not full store size.

### Work

1. **Debounce Inbox search** (mirror Library ~200ms) before binding `q` into the Colada query key.

2. **Single list layout + virtualization**
   - Inbox/Library currently mount both mobile cards and desktop table (CSS-hidden) → ~2N DOM nodes.
   - Render one list via `useDisplay()` / `matchMedia`; add `v-virtual-scroll` or table virtualizer; cap visible rows until API pagination lands.

3. **Paginate list APIs end-to-end**
   - Add `limit`/`cursor` to OpenAPI `listDocuments` / `listLibraryDocuments`, mock, and views (default page size e.g. 50).

4. **Isolate draft preview from history re-renders**
   - `DocumentWorkspaceView` passes live `draftForm.bodyMarkdown` into `HistoryPanel`; every keystroke re-renders timeline + preview.
   - Split preview into its own child, debounce preview, or `v-memo` history by event ids/length.

5. **Tighten Colada invalidation / staleTime**
   - Global `staleTime: 10_000` plus “invalidate all `listDocuments`” on every workspace mutation causes full-list refetch storms.
   - Raise staleTime for control/types; invalidate only affected inbox keys or patch cache; skip full-list invalidate on draft saves that do not change summary fields.

6. **Push persona (or equivalent) into list query params** so “Waiting on me” does not download the full accessible set.

7. **Cheap dirty detection & stable validation rules**
   - Avoid full-form `JSON.stringify` in hot Admin computeds (field-level flags or debounced snapshot).
   - Hoist `titleRules()` / `bodyMarkdownRules()` to module constants or once in `<script setup>`.

8. **Lazy stage bodies & list cell maps**
   - `v-if` heavy panel bodies when collapsed (or async components).
   - Build `Map<id, label>` once for type labels; preformat dates when `items` changes (`Intl.DateTimeFormat` singleton).

### Exit criteria

- Typing in Inbox search does not fire a request per keystroke.
- Only one list layout is in the DOM at a time; large lists virtualize or paginate.
- Draft typing does not re-render the full history timeline.
- Mock/OpenAPI list endpoints accept pagination; UI uses it.

---

## Phase 17 — UI hierarchy, feedback consistency & a11y

**Status:** Implemented.

**Goal:** Primary views meet the app’s own landmark/H1 intent; feedback channels are predictable; chrome does not compete with the user’s one job per screen.

### Work

1. **Page H1 on document & published views**
   - `hidePageHeading` is fine if the view owns the title — render a real `<h1>` in `WorkspaceHeader` / `PublishedDocumentView` (not `div.text-h6` / `div.text-h5`).
   - Optionally sync `document.title` from route + case title.

2. **Landmarks**
   - Wrap primary nav (app bar + drawer) in `<nav aria-label="Primary">`.
   - Keep skip → `#main-content`; ensure the main region matches axe fixtures (`landmarks.axe.test.ts`).

3. **Identity failure control**
   - Replace clickable failed `v-chip` with `v-btn` “Retry sign-in” (or proper button semantics + label).

4. **Unify feedback channels**
   - Transient success → snackbar (`useToast`).
   - Durable/blocking errors → `v-alert role="alert"` near the action.
   - Add `role="alert"` on New request form errors; prefer toast (or dismissible alert) for Admin save success.

5. **Workspace composition**
   - One primary expanded stage; demote secondary stages (expansion panels or thinner headers).
   - Move supersede into header actions; clarify history vs preview hierarchy.
   - Add `v-expand-transition` (or expansion-panel motion) on stage bodies.

6. **Inbox filter hierarchy**
   - Persona chips as primary row; collapse type/status into a Filters menu or secondary row.
   - Demote always-visible Refresh if staleTime/focus refetch covers it.
   - Empty inbox: CTA “New request” + “Clear filters” when filters active.

7. **Confirm dialog a11y**
   - `aria-labelledby` / `aria-describedby`; initial focus per severity (Cancel vs Confirm).

8. **Tables & published reader**
   - Captions (visible or visually hidden); consistent `scope="col"`.
   - Published: one header band (number, H1 title, status, actions) + content using type **label** and preview styling—not raw type id in a stack of similar cards.

9. **Light polish**
   - Surface `appConfig.brand.tagline` once (Inbox or New request intro)—not a marketing hero.
   - Drop redundant outer cards on New request / Not found.
   - Demo persona switcher in mobile drawer when `showPersonaSwitcher`.
   - Single hit target for stage expand/collapse headers.

### Exit criteria

- Every primary route has an H1 inside the main landmark; axe smoke stays green (or documented waivers).
- Success/error placement is consistent across Inbox → Workspace → Admin → New request.
- Empty inbox offers a next action.
- Confirm dialogs expose accessible name and description.

---

## Suggested implementation order

```text
Phase 14  (dirty state & races)     ←── stop silent data loss
    ↓
Phase 15  (AuthZ fidelity)          ←── UI/server/mock parity
    ↓
Phase 16  (list & query perf)       ←── debounce, paginate, isolate preview
    ↓
Phase 17  (UI hierarchy & a11y)     ←── H1/landmarks, feedback, empty CTAs
```

Phases 16 and 17 may proceed in parallel after Phase 14’s dirty guards land (so Admin hydrate fixes are not undone by aggressive list refetch UX). Phase 15 AuthZ items that only touch domain helpers can land beside 14.

---

## PR / delivery slicing

| PR  | Title focus                                                             |
| --- | ----------------------------------------------------------------------- |
| 14a | Admin selection-guard hydrate skip; confirm-dialog overlap policy       |
| 14b | Workspace leave/switch dirty guards; preserve approval comments         |
| 14c | Submit-when-dirty; in-flight button disables; mutation invalidate-by-id |
| 15a | `canPublish` + mock roles-from-actor; elevation access gate             |
| 15b | Inbox excludes published; persona publish AuthZ; identity retry/race    |
| 15c | Release active-step checks                                              |
| 16a | Debounce inbox search; dual-layout → single + virtualize                |
| 16b | List pagination OpenAPI → mock → UI; Colada invalidation/`staleTime`    |
| 16c | Draft preview isolation; rules hoist; type-label map; lazy stage bodies |
| 17a | H1 + landmarks + identity retry button + feedback channel unify         |
| 17b | Workspace/inbox composition; empty CTAs; confirm a11y; tables/captions  |
| 17c | Published reader structure; light brand/card polish                     |

---

## Deferred / non-goals (unless pulled in)

- Replacing Vuetify or abandoning the local mock.
- Browser-side PDF generation.
- Full Dataverse plugin rewrite (number allocation / publish races remain Flow/Dataverse concerns).
- Records retention, legal hold, anonymous public reader.
- Turning Vue a11y ESLint to error for the whole app in one shot (enable progressively with Phase 17).
- Bundle-size overhauls beyond keeping tree-shaken icons + route lazy-loading (already healthy).

---

## Relationship to earlier roadmaps

Phases **0–8** in [`remediation-roadmap.md`](./remediation-roadmap.md) and Phases **9–13** in [`post-phase-8-review-roadmap.md`](./post-phase-8-review-roadmap.md) remain historical. **This document starts at Phase 14** and does not reopen locked product rules except where bugs show incomplete enforcement (publish AuthZ UI parity, mock role derivation, elevation access timing, inbox vs library separation).

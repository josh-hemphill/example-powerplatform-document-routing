# Provisioning & shared-environment ALM roadmap

Plan to close the gaps between today’s **generate → optional Web API apply** toolkit and elegant adoption in **large shared Power Platform environments** (publisher ownership, solution ALM, connection references, security roles, prefix governance, and prefix-aware downstream artifacts).

**Status:** Phases 18–22 implemented.  
**Context:** Shared-env ALM path is complete: publisher/solution scaffolding, connection refs + env vars, security role templates, prefix-aware flows/seed, and SHARED_ENV + CI validation.

**Preceding app roadmaps:** [`remediation-roadmap.md`](./remediation-roadmap.md) (0–8), [`post-phase-8-review-roadmap.md`](./post-phase-8-review-roadmap.md) (9–13), [`post-phase-13-review-roadmap.md`](./post-phase-13-review-roadmap.md) (14–17).

**Suggested order:** Phase 18 → 19 → 20 → 21 → 22. Phase 21 (roles) can overlap with 20 after solution scaffolding exists; Phase 22 (flows packaging) trails schema + solution membership.

---

## Guiding decisions

| Decision               | Choice                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary ALM path       | **Solution-first**: metadata, env vars, connection references, roles, and flows live in (or are added to) a Dataverse solution owned by a registered publisher.                                                                             |
| Web API apply          | Keep as a **dev / scratch** path, but mark it explicitly non-production for shared orgs; prefer pack → import for shared environments.                                                                                                      |
| Prefix                 | Profile `publisher.prefix` remains the single stamp for tables/columns/relationships/env vars; **register** that publisher in Dataverse and **refuse apply/import** when the prefix is already owned by another publisher (or warn loudly). |
| Connection wiring      | Move from ad-hoc `pa connection create` toward **connection references** as solution components; `pa-connect.sh` becomes “bind refs + app data sources,” not the source of truth.                                                           |
| Security roles         | Provision as solution components (or documented privilege templates exported with the solution), mapped by `src/domain/security-roles.ts`.                                                                                                  |
| Downstream artifacts   | Flow stubs, SUMMARY, runtime comments, and SETUP must be **prefix-parameterized** — no hardcoded `dr_*` once prefix ≠ `dr`.                                                                                                                 |
| Shared-env coexistence | Unique publisher prefix + solution unique name + no unmanaged pollution from the happy path.                                                                                                                                                |

---

## Finding → phase map

| Finding (summary)                                                         | Severity | Phase |
| ------------------------------------------------------------------------- | -------- | ----- |
| `solution` profile block is unused (no pack/import/membership)            | Critical | 18    |
| `publisher.uniqueName` / friendlyName unused (no publisher registration)  | Critical | 18    |
| `provision:apply` writes unmanaged metadata outside a solution            | Critical | 18    |
| No prefix collision / ownership check against target org                  | High     | 18    |
| Connection references not first-class ALM components                      | High     | 19    |
| `pa-connect.sh` only creates connections / data sources                   | High     | 19    |
| Env var definitions not solution-scoped / no current-value ALM story      | Medium   | 19    |
| Security roles documented only (`SECURITY_ROLES.md`)                      | High     | 20    |
| Role privilege sets not exported or applied with the solution             | High     | 20    |
| Flow stubs hardcoded to `dr_*`; not packaged solutions                    | High     | 21    |
| SUMMARY / SETUP / runtime comments assume `dr_*`                          | Medium   | 21    |
| Control seed import not solution-aware / Contoso demo risk in shared orgs | Medium   | 21    |
| No PAC/CLI solution pack–export–import automation in CI-friendly scripts  | High     | 18–19 |
| No “shared env adopter checklist” for multi-team orgs                     | Medium   | 22    |

---

## Design references

| Principle                      | Application here                                                            |
| ------------------------------ | --------------------------------------------------------------------------- |
| Solution is the unit of deploy | Everything adopters ship should be addable to `solution.uniqueName`         |
| Publisher owns the prefix      | Register publisher before creating prefixed metadata; detect collisions     |
| Layered ALM                    | Dev unmanaged → export → build managed → import to shared/test/prod         |
| Least surprise                 | Profile fields that exist must drive behavior or be removed from the schema |
| Host-agnostic URLs stay        | Vanity SharePoint / custom Dataverse domains remain first-class             |

---

## Phase 18 — Publisher ownership & solution-first scaffolding

**Status:** Implemented.

**Goal:** Make `publisher` and `solution` in `deploy/connections.json` real. Shared-env happy path is “ensure publisher → ensure solution → add components → pack/import,” not bare Web API entity creates.

### Delivered

1. **Consume profile fields** — `alm-manifest.json`, SUMMARY publisher/solution section, `solution-pack.md` / `.sh`.
2. **Publisher ensure / collision gate** — `ensurePublisher` / `PublisherCollisionError` before apply and `provision:solution`.
3. **Solution ensure** — `ensureSolution` + `AddSolutionComponent` for planned tables via `--into-solution`.
4. **Dual-path** — `provision:apply` gated by `--unmanaged-ok` / `allowUnmanagedApply`; `provision:solution` preferred; `--into-solution` for apply + membership.
5. **Artifacts** — SUMMARY ALM section; pack guides under `deploy/generated/`.

### Exit criteria

- [x] Profile `solution` and `publisher.uniqueName` are read by provision code and appear in artifacts.
- [x] Prefix collision against another publisher fails closed on apply/solution ensure.
- [x] Docs state unmanaged Web API apply is scratch-only for shared environments.

---

## Phase 19 — Connection references & environment variable ALM

**Status:** Implemented.

**Goal:** Shared environments get solution-scoped connection references and env vars; `pa-connect.sh` binds rather than invents the ALM story.

### Delivered

1. **Connection reference model** — `{prefix}_sharepoint` / `{prefix}_dataverse` (overridable); `connection-references.json`; Web API ensure + solution association on `--into-solution`.
2. **`pa-connect` bind-to-ref** — default script binds CONNECTION_ID to the solution reference; `legacyDirectConnection` for scratch.
3. **Environment variables** — definitions as solution components (type 380); `environment-variable-values.md` for per-env current values; runtime docs use `{prefix}_*`.
4. **Idempotent ensure** — GET-before-POST by `schemaname` / `connectionreferencelogicalname`.

### Exit criteria

- [x] Generated solution path includes connection references + env var definitions.
- [x] SUMMARY no longer tells shared-env adopters that raw `pa connection create` is the primary wiring story.
- [x] Env var ensure is idempotent without relying solely on duplicate-error heuristics.

---

## Phase 20 — Security roles as solution components

**Status:** Implemented.

**Goal:** The five Document Routing roles are provisionable and assignable in shared orgs without hand-building privilege matrices from a markdown table alone.

### Delivered

1. **Role definitions as data** — `src/provisioning/security-roles-plan.ts` privilege template keyed by schema names; prefix applied at generate time; display names stay aligned with `src/domain/security-roles.ts`.
2. **Provision path** — `security-roles.json` / `security-roles.md` artifacts; SUMMARY + alm-manifest list roles; create inside the solution (maker/PAC).
3. **`/principal` contract** — SETUP + SECURITY_ROLES document display-name expectation.
4. **Service / Flow principal** — Documented Document Routing Service; no SPA-token elevation.

### Exit criteria

- [x] Roles can be created/imported with the solution for a non-`dr` prefix without editing markdown by hand.
- [x] SETUP/SECURITY_ROLES describe assignment in shared environments.
- [x] Domain role mapping tests cover generated display names.

---

## Phase 21 — Prefix-aware flows, docs, and control seed

**Status:** Implemented.

**Goal:** Nothing in the adopter path silently assumes `dr_` when `publisher.prefix` is something else.

### Delivered

1. **Flow stubs** — `deploy/generated/flows/*` from `deploy/flows/` with prefix substitution.
2. **Docs** — SETUP / deploy README / flows README / SHARED*ENV use `{prefix}*\*`; solution path first.
3. **Control seed** — shared-env safe by default; Contoso only with `--demo-seed`.
4. **Tests** — non-default prefix (`acme`) for flows + SUMMARY.

### Exit criteria

- [x] `publisher.prefix: "acme"` yields flows/docs/examples with `acme_*`, not leftover `dr_*`.
- [x] Demo seed cannot land in a shared org without an explicit opt-in.
- [x] Deploy README describes solution path first, unmanaged apply last.

---

## Phase 22 — Shared-environment adopter experience & CI

**Status:** Implemented.

**Goal:** A team landing in a busy shared org has a checklist, scripts, and CI-shaped commands that match Power Platform ALM norms.

### Delivered

1. **`deploy/SHARED_ENV.md`** + SETUP cross-links.
2. **CLI** — `provision:export` / `pack` / `import` wrappers; `provision:validate`; placeholder fail-closed for pack.
3. **Layer guidance** — unmanaged → export → managed import; version bump note.
4. **Observability** — SUMMARY includes prefix, publisher, solution, connection refs, role names, unmanaged-apply + demo-seed flags.
5. **CI** — generate example artifacts + offline validate (no live org).

### Exit criteria

- [x] New adopter can follow SHARED_ENV.md without reading provisioning TypeScript.
- [x] CI can generate + validate solution artifacts for a sample prefix without calling a live org.
- [x] Unmanaged apply is clearly secondary and gated.

---

## Suggested implementation order

```text
Phase 18  Publisher + solution scaffolding     ←── stop unmanaged pollution / dead profile fields
    ↓
Phase 19  Connection refs + env var ALM        ←── shared-env wiring
    ↓
Phase 20  Security roles in solution           ←── assignable privileges
    ↓
Phase 21  Prefix-aware flows/docs/seed         ←── no silent dr_* assumptions
    ↓
Phase 22  Shared-env checklist + CI wrappers   ←── adopter + automation polish
```

Phases 20 and 21 may proceed in parallel after 18c lands solution membership hooks. Phase 19 should complete before treating flows that depend on connection references as “done.”

---

## Non-goals (unless pulled in)

- Rewriting the Vue Code App to use a different host model.
- Replacing Dataverse with another store.
- Full Azure DevOps / GitHub Actions ALM enterprise product (wrappers + docs are enough for this example repo).
- Automatic reservation of publisher prefixes across a tenant (collision detect on target org is enough).
- Shipping Contoso demo data into shared production environments.

---

## Relationship to current code

| Today                                                                          | After this roadmap                            |
| ------------------------------------------------------------------------------ | --------------------------------------------- |
| `pnpm provision` generates ALM artifacts (solution, refs, roles, flows, seed)  | Shared-env path complete (Phases 18–22)       |
| `pnpm provision:apply` gated; `provision:solution` preferred                   | Scratch unmanaged vs solution-first dual path |
| Connection refs + env var defs are solution-scoped; `pa-connect` binds to refs | Done (Phase 19)                               |
| Prefix stamps logical names + publisher ownership check                        | Flows/docs/seed prefix-aware (Phase 21)       |
| Roles as privilege template + generated guide                                  | Assign via teams; `/principal` display names  |
| Flow templates with `dr_`; generated copies use active prefix                  | Import `deploy/generated/flows/`              |

---

## Success metric

An adopter with a **non-default prefix** can land Document Routing in a **shared Power Platform environment** beside other teams’ solutions: unique publisher ownership, solution-scoped tables/env vars/connection refs/roles, no unmanaged metadata from the recommended path, and no leftover `dr_*` assumptions in flows or docs.

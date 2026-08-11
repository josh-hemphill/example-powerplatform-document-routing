# Provisioning & shared-environment ALM roadmap

Plan to close the gaps between today’s **generate → optional Web API apply** toolkit and elegant adoption in **large shared Power Platform environments** (publisher ownership, solution ALM, connection references, security roles, prefix governance, and prefix-aware downstream artifacts).

**Status:** Phase 18 implemented; Phases 19–22 planned.  
**Context:** Assessment of current tooling — prefixing works for metadata; Phases 19+ still need connection references, security roles in-solution, prefix-aware flows/docs, and shared-env CI wrappers.

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

**Goal:** Shared environments get solution-scoped connection references and env vars; `pa-connect.sh` binds rather than invents the ALM story.

### Work

1. **Connection reference model**
   - Extend connection profile (or generated plan) with named connection references for SharePoint (and Dataverse where needed).
   - Generate connection-reference metadata into the solution (logical names prefixed or solution-unique).
   - Document how adopters bind a real connection to each reference per environment.

2. **Evolve `pa-connect-commands.ts`**
   - Prefer: ensure connection → create/update connection reference in solution → `pa app add data-source` against the reference.
   - Keep a “legacy direct connection” fallback behind a flag for local play.

3. **Environment variables**
   - Create env var **definitions** as solution components (already POSTed today — add solution membership).
   - Emit per-environment **current value** guidance (or optional apply of values from profile) without baking secrets into git.
   - Align runtime docs: hosted apps read `{prefix}_SharePointSiteUrl` etc., not hardcoded `dr_*`.

4. **Idempotent env var ensure**
   - GET-before-POST (or list-by-schemaname) like entities, not error-string matching alone.

### Exit criteria

- Generated solution path includes connection references + env var definitions.
- SUMMARY no longer tells shared-env adopters that raw `pa connection create` is the primary wiring story.
- Env var ensure is idempotent without relying solely on duplicate-error heuristics.

### PR slicing

| PR  | Focus                                         |
| --- | --------------------------------------------- |
| 19a | Connection reference schema + generation      |
| 19b | `pa-connect` bind-to-ref flow                 |
| 19c | Env var solution membership + GET-before-POST |

---

## Phase 20 — Security roles as solution components

**Goal:** The five Document Routing roles are provisionable and assignable in shared orgs without hand-building privilege matrices from a markdown table alone.

### Work

1. **Role definitions as data**
   - Codify `SECURITY_ROLES.md` into a machine-readable privilege template (JSON/YAML) keyed to **schema names** (prefix applied at generate time).
   - Keep display-name mapping aligned with `src/domain/security-roles.ts`.

2. **Provision path**
   - Generate role create / privilege grant steps into the solution plan (or PAC role import artifacts).
   - Add roles to the solution; document assignment (teams vs users) for shared envs.

3. **Hosted `/principal` contract**
   - Document production expectation: return Dataverse role **display names**; mapping already exists — ensure SETUP points at generated role names when prefix/branding changes labels.

4. **Service / Flow principal**
   - Document a **Document Routing Service** (or reuse Admin + service account) for SLA/publish flows; do not invent SPA-token elevation.

### Exit criteria

- Roles can be created/imported with the solution for a non-`dr` prefix without editing markdown by hand.
- SETUP/SECURITY_ROLES describe assignment in shared environments.
- Domain role mapping tests cover generated display names.

### PR slicing

| PR  | Focus                                            |
| --- | ------------------------------------------------ |
| 20a | Privilege template + prefix substitution         |
| 20b | Solution membership / apply or PAC import        |
| 20c | Docs + `/principal` / service principal guidance |

---

## Phase 21 — Prefix-aware flows, docs, and control seed

**Goal:** Nothing in the adopter path silently assumes `dr_` when `publisher.prefix` is something else.

### Work

1. **Flow stubs**
   - Parameterize table/column logical names from the provision prefix (generate `deploy/generated/flows/*` from templates under `deploy/flows/`).
   - Prefer packaging flows **into the solution** (Phase 18/19 scaffolding) over “import JSON manually and rebind.”
   - Keep human-readable stubs in `deploy/flows/` as templates; generated copies are prefix-correct.

2. **Docs & comments**
   - Replace hardcoded `` `dr_*` `` in SUMMARY, SETUP, deploy README, runtime comments with “`{prefix}_*` (default `dr`)” or generate examples from the active profile.
   - Fix the aspirational “or import a solution built from this schema” line so it points at the real `provision:solution` path once it exists.

3. **Control seed**
   - Generate seed with prefixed lookups / type ids as needed.
   - Shared-env default: **do not** auto-import Contoso emails; require `--demo-seed` or an explicit Admin import action.
   - Document how seed rows relate to solution (configuration data vs reference data).

4. **Schema / Flow contract tests**
   - Test that generated flow templates contain `prefixedLogicalName(prefix, …)` for every table touch.
   - Test SUMMARY samples for a non-default prefix (e.g. `acme`).

### Exit criteria

- `publisher.prefix: "acme"` yields flows/docs/examples with `acme_*`, not leftover `dr_*`.
- Demo seed cannot land in a shared org without an explicit opt-in.
- Deploy README describes solution path first, unmanaged apply last.

### PR slicing

| PR  | Focus                                              |
| --- | -------------------------------------------------- |
| 21a | Prefix-parameterized flow generation               |
| 21b | Docs/SUMMARY/runtime comment sweep                 |
| 21c | Control seed opt-in + tests for non-default prefix |

---

## Phase 22 — Shared-environment adopter experience & CI

**Goal:** A team landing in a busy shared org has a checklist, scripts, and CI-shaped commands that match Power Platform ALM norms.

### Work

1. **Adopter checklist** (`SETUP.md` or `deploy/SHARED_ENV.md`)
   - Reserve/confirm publisher prefix with the platform owners.
   - Create or reuse solution unique name; avoid unmanaged apply.
   - Bind connection references per environment.
   - Assign security roles; configure Flow service principal.
   - Import managed (or unmanaged-dev) solution; smoke-test Code App.

2. **CLI surface**
   - Document / implement scripts such as:
     - `pnpm provision` (generate)
     - `pnpm provision:solution` (ensure publisher/solution + emit pack)
     - `pnpm provision:pack` / `provision:export` / `provision:import` (PAC wrappers where available)
     - `pnpm provision:apply --unmanaged-ok` (scratch only)
   - Fail CI if generated artifacts still contain placeholder hosts when packing.

3. **Layer guidance**
   - Short doc: unmanaged in personal/dev → export → managed import to shared test/prod.
   - Version bump rules for `solution.version`.

4. **Observability**
   - SUMMARY includes: prefix, publisher unique name, solution unique name/version, connection ref names, role names, whether unmanaged apply is enabled.

### Exit criteria

- New adopter can follow SHARED_ENV.md without reading provisioning TypeScript.
- CI can generate + validate solution artifacts for a sample prefix without calling a live org (pack dry-run / fixture).
- Unmanaged apply is clearly secondary and gated.

### PR slicing

| PR  | Focus                                              |
| --- | -------------------------------------------------- |
| 22a | SHARED_ENV.md + SETUP cross-links                  |
| 22b | PAC wrapper scripts + package.json entries         |
| 22c | CI validation job for generated solution artifacts |

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

| Today                                                                | After this roadmap                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm provision` generates Web API plan + ALM manifest + pack guides | Same foundation; Phases 19+ add connection refs / roles / flows |
| `pnpm provision:apply` gated; `provision:solution` preferred         | Scratch unmanaged vs solution-first dual path (Phase 18 done)   |
| `solution` / `publisher.uniqueName` drive ensure/pack artifacts      | Connection refs + roles + flows still to follow                 |
| Prefix stamps logical names + publisher ownership check              | Keep; extend to flows/docs in Phase 21                          |
| Roles in markdown                                                    | Privilege templates in the solution                             |
| Flow stubs with `dr_*`                                               | Generated prefix-correct flows (+ optional solution package)    |

---

## Success metric

An adopter with a **non-default prefix** can land Document Routing in a **shared Power Platform environment** beside other teams’ solutions: unique publisher ownership, solution-scoped tables/env vars/connection refs/roles, no unmanaged metadata from the recommended path, and no leftover `dr_*` assumptions in flows or docs.

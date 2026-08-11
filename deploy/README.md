# Deploy scaffolding — Dataverse + SharePoint

This folder makes it straightforward to stand up **Dataverse tables** for the document-routing case store and wire a **SharePoint site/library** for published PDFs — including **custom / vanity domains** (no baked-in `*.sharepoint.com` or `*.dynamics.com` requirement).

## Quick path

```bash
cp deploy/connections.example.json deploy/connections.json
# Edit hosts: dataverse.environmentUrl, sharePoint.siteUrl, api.baseUrl, environmentId
# Confirm publisher.uniqueName / solution.* match the org you will own

pnpm provision                 # generate deploy/generated/* (includes ALM manifest + pack guides)
pnpm provision:solution        # preferred: ensure publisher + unmanaged solution (needs token)
pnpm provision:apply -- --into-solution   # optional: Web API apply then AddSolutionComponent
# Scratch only: pnpm provision:apply -- --unmanaged-ok
bash deploy/generated/pa-connect.sh   # after replacing CONNECTION_ID
```

## Files

| Path                       | Purpose                                         |
| -------------------------- | ----------------------------------------------- |
| `connections.example.json` | Template connection profile (placeholder hosts) |
| `connections.json`         | Your real profile (**gitignored**)              |
| `connections.schema.json`  | JSON Schema for the profile                     |
| `generated/`               | Output of `pnpm provision` (gitignored)         |

## Domain rules

- **Any HTTPS host** is valid for SharePoint site URL, Dataverse org URL, and API base URL.
- Vanity SharePoint (`https://docs.contoso-corp.net/...`) and custom Dataverse domains are first-class.
- Provisioning refuses to _apply_ while hosts still look like `example.com` / `REPLACE_ME` / sample `contoso` placeholders.
- Microsoft primary domains are **allowed** when that is what your tenant uses — they are simply **not assumed**.

## What gets created

Dataverse tables (publisher prefix default `dr`) — see [`SCHEMA.md`](./SCHEMA.md):

**Control (org-owned)**

- `dr_publishdestination` — allowlisted SharePoint publish roots
- `dr_approverpool` / `dr_approverpoolmember` — pools + members
- `dr_documenttype` / `dr_approvalchainstep` — types, scaffolds, policy version, chain templates
- `dr_appsetting` — feature flags

**Case**

- `dr_document` — case + collaborative draft + revision + publish destination lookup
- `dr_approvalstep` — runtime steps with immutable `activatedueat` SLA
- `dr_historyevent` — audit trail

Environment variables (seeded defaults from your connection profile; **current values** are per-environment — see `environment-variable-values.md`):

- `{prefix}_SharePointSiteUrl`, `{prefix}_SharePointLibraryName`, `{prefix}_SharePointFolderPath`
- `{prefix}_DocumentApiBaseUrl`, `{prefix}_DataverseEnvironmentUrl`

Connection references (solution components; defaults overridable in `connectionReferences`):

- `{prefix}_sharepoint` → SharePoint Online connector
- `{prefix}_dataverse` → Dataverse connector (flows / solution apps; omit with `"dataverse": false`)

`pnpm provision` also writes `control-seed.json`, `connection-references.json`, `environment-variable-values.md`, and a shell-quoted `pa-connect.sh` (bind-to-ref by default). **Validation errors prevent writing executable artifacts.**

SharePoint remains the **PDF binary** target. Lists are not used as the workflow store.

Security role sketch: [`SECURITY_ROLES.md`](./SECURITY_ROLES.md).

Power Automate stubs (SLA, notify, publish, submit guard): [`flows/`](./flows/).

## Solution-first vs unmanaged apply

| Command                                   | Use when                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm provision`                          | Generate plans, ALM manifest, connection refs, env-value guide, `pa-connect.sh`               |
| `pnpm provision:solution`                 | Shared/dev org: ensure publisher owns the prefix and create the unmanaged solution            |
| `pnpm provision:apply -- --into-solution` | Apply plan (tables + env defs + connection refs) then add components to `solution.uniqueName` |
| `pnpm provision:apply -- --unmanaged-ok`  | **Scratch only** — unmanaged metadata outside a solution                                      |
| Profile `allowUnmanagedApply: true`       | Same as `--unmanaged-ok` without the CLI flag (local profiles only)                           |
| Profile `legacyDirectConnection: true`    | Scratch `pa-connect.sh` without connection-reference bind guidance                            |

Prefix collision (prefix already owned by another `publisher.uniqueName`) **fails closed** on solution ensure and apply.

## Auth for live ensure / apply

Requires **Node.js 22+** (`engines.node`) for `node --experimental-strip-types`.

Deployable hosts must be **HTTPS** (relative `/api` is allowed only for local mock API base URLs).

Obtain a Dataverse Web API bearer token for your org URL (custom domain OK), then:

```bash
export DATAVERSE_ACCESS_TOKEN='…'
pnpm provision:solution
# or
pnpm provision:apply -- --into-solution
```

Dry-run generation never calls the network. Publisher create needs System Customizer / System Administrator (or equivalent).

> **Shared environments:** Prefer `provision:solution` + pack/import (`solution-pack.md`). Unmanaged `provision:apply` without `--into-solution` is gated behind `--unmanaged-ok` / `allowUnmanagedApply`. See [`docs/provisioning-alm-roadmap.md`](../docs/provisioning-alm-roadmap.md).

## Code App data sources

`deploy/generated/pa-connect.sh` prefers the **connection-reference bind** path: create a SharePoint connection, bind its `CONNECTION_ID` to `{prefix}_sharepoint` in the solution, then `pa app add data-source`. Set `legacyDirectConnection: true` for scratch direct connection-id wiring.

The SharePoint `--dataset` value is your `sharePoint.siteUrl` as-is.

Ensure `power.config.json` exists (`pnpm power:init`) before adding data sources.

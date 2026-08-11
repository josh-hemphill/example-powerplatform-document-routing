# Deploy scaffolding — Dataverse + SharePoint

This folder makes it straightforward to stand up **Dataverse tables** for the document-routing case store and wire a **SharePoint site/library** for published PDFs — including **custom / vanity domains** (no baked-in `*.sharepoint.com` or `*.dynamics.com` requirement).

## Quick path

```bash
cp deploy/connections.example.json deploy/connections.json
# Edit hosts: dataverse.environmentUrl, sharePoint.siteUrl, api.baseUrl, environmentId

pnpm provision                 # generate deploy/generated/*
pnpm provision:apply           # optional: create tables via Web API (needs DATAVERSE_ACCESS_TOKEN)
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

Environment variables (seeded from your connection profile):

- `dr_SharePointSiteUrl`, `dr_SharePointLibraryName`, `dr_SharePointFolderPath`
- `dr_DocumentApiBaseUrl`, `dr_DataverseEnvironmentUrl`

`pnpm provision` also writes `control-seed.json` (demo types/pools from `src/config/document-types.ts`) and a shell-quoted `pa-connect.sh`. **Validation errors prevent writing executable artifacts.**

SharePoint remains the **PDF binary** target. Lists are not used as the workflow store.

Security role sketch: [`SECURITY_ROLES.md`](./SECURITY_ROLES.md).

Power Automate stubs (SLA, notify, publish, submit guard): [`flows/`](./flows/).

## Auth for `provision:apply`

Requires **Node.js 22+** (`engines.node`) for `node --experimental-strip-types`.

Deployable hosts must be **HTTPS** (relative `/api` is allowed only for local mock API base URLs).

Obtain a Dataverse Web API bearer token for your org URL (custom domain OK), then:

```bash
export DATAVERSE_ACCESS_TOKEN='…'
pnpm provision:apply
```

Dry-run generation never calls the network.

> **Shared environments:** Direct Web API apply creates unmanaged metadata outside a solution. For multi-team orgs, follow the solution-first plan in [`docs/provisioning-alm-roadmap.md`](../docs/provisioning-alm-roadmap.md) (Phases 18–22) once implemented; treat `provision:apply` as scratch/dev until then.

## Code App data sources

`deploy/generated/pa-connect.sh` emits `pa connection create` / `pa app add data-source` commands. The SharePoint `--dataset` value is your `sharePoint.siteUrl` as-is.

Ensure `power.config.json` exists (`pnpm power:init`) before adding data sources.

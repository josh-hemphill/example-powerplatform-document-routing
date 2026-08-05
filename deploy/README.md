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

| Path | Purpose |
| --- | --- |
| `connections.example.json` | Template connection profile (placeholder hosts) |
| `connections.json` | Your real profile (**gitignored**) |
| `connections.schema.json` | JSON Schema for the profile |
| `generated/` | Output of `pnpm provision` (gitignored) |

## Domain rules

- **Any HTTPS host** is valid for SharePoint site URL, Dataverse org URL, and API base URL.
- Vanity SharePoint (`https://docs.contoso-corp.net/...`) and custom Dataverse domains are first-class.
- Provisioning refuses to *apply* while hosts still look like `example.com` / `REPLACE_ME` / sample `contoso` placeholders.
- Microsoft primary domains are **allowed** when that is what your tenant uses — they are simply **not assumed**.

## What gets created

Dataverse tables (publisher prefix default `dr`):

- `dr_document` — case + draft + denormalized inbox/SLA fields
- `dr_approvalstep` — named/pool steps, claim/SLA/elevation JSON pools
- `dr_historyevent` — audit trail

Environment variables (seeded from your connection profile):

- `dr_SharePointSiteUrl`, `dr_SharePointLibraryName`, `dr_SharePointFolderPath`
- `dr_DocumentApiBaseUrl`, `dr_DataverseEnvironmentUrl`

SharePoint remains the **PDF binary** target. Lists are not used as the workflow store.

## Auth for `provision:apply`

Obtain a Dataverse Web API bearer token for your org URL (custom domain OK), then:

```bash
export DATAVERSE_ACCESS_TOKEN='…'
pnpm provision:apply
```

Dry-run generation never calls the network.

## Code App data sources

`deploy/generated/pa-connect.sh` emits `pa connection create` / `pa app add data-source` commands. The SharePoint `--dataset` value is your `sharePoint.siteUrl` as-is.

Ensure `power.config.json` exists (`pnpm power:init`) before adding data sources.

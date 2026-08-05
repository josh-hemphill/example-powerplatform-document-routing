# Setup checklist — adopt this app for your org

This starter is designed so most tenant-specific work happens in **config + deploy scaffolding**. You should not need to rewrite the workflow UI for a normal document-routing use case.

## 1. Edit org defaults (required)

### Connection profile (recommended)

```bash
cp deploy/connections.example.json deploy/connections.json
```

Set **your** hosts — any HTTPS domain works (vanity SharePoint, custom Dataverse, private API). Do **not** assume `*.sharepoint.com` or `*.dynamics.com`.

| Field | Purpose |
| --- | --- |
| `dataverse.environmentUrl` | Dataverse org URL (custom domains supported) |
| `sharePoint.siteUrl` | Publish site URL (custom / vanity hosts supported) |
| `sharePoint.libraryName` / `folderPath` | Library + default folder |
| `api.baseUrl` | OpenAPI / Custom Connector base URL |
| `powerPlatform.environmentId` | Environment GUID for `pa` commands |
| `publisher.prefix` | Dataverse publisher prefix (default `dr`) |

Then generate wiring artifacts:

```bash
pnpm provision
# review deploy/generated/SUMMARY.md
```

Details: [`deploy/README.md`](./deploy/README.md).

### `src/config/app.config.ts` / `.env`

| Field / env | What to change |
| --- | --- |
| `brand.*` | Product name shown in the shell |
| `VITE_SHAREPOINT_SITE_URL` | Overrides SharePoint site (any HTTPS host) |
| `VITE_SHAREPOINT_LIBRARY_NAME` | Library name |
| `VITE_SHAREPOINT_FOLDER_PATH` | Default folder |
| `VITE_DATAVERSE_ENVIRONMENT_URL` | Optional org URL for adapters |
| `VITE_DOCUMENT_API_BASE_URL` | API / Custom Connector base |
| `localDemoUser` | Fallback identity for local Vite play |
| `features.showSetupBanner` | Set `false` once placeholders are gone |
| `features.allowApproverOverride` | Let authors edit the default chain at submit time |

### `src/config/document-types.ts`

Add or edit document types. Each type controls:

- Label / description / request hint
- Draft Markdown scaffold (`{{title}}`, `{{request}}`)
- Default ordered **approval chain** (named and/or pool + SLA)
- Optional SharePoint `folderPath`

Out of the box: `policy`, `sop`, `announcement`.

## 2. Run locally

```bash
pnpm install
pnpm generate:api
pnpm dev
```

Walk the seeded inbox: request → draft → approvals → publish. Seed data lives in `src/mock/seed-documents.ts` (demo only).

## 3. Provision Dataverse + connect SharePoint

### Create tables

```bash
# After editing deploy/connections.json
pnpm provision

# Optional automated create via Dataverse Web API
export DATAVERSE_ACCESS_TOKEN='…'   # token for your org URL (custom domain OK)
pnpm provision:apply
```

This scaffolds:

- `dr_document`, `dr_approvalstep`, `dr_historyevent`
- Environment variables for SharePoint site/library/folder + API/Dataverse URLs

### Attach Code App data sources

```bash
pnpm exec pa auth login
pnpm power:init
# Replace CONNECTION_ID inside the generated script, then:
bash deploy/generated/pa-connect.sh
```

Or manually (dataset / org-url are **your** hosts from `connections.json`):

```bash
pnpm exec pa connection create --connector shared_sharepointonline

pnpm exec pa app add data-source \
  --connector dataverse \
  --table dr_document \
  --org-url "https://your-dataverse-host.example"

pnpm exec pa app add data-source \
  --connector shared_sharepointonline \
  --connection-id "<connectionId>" \
  --table "Published Documents" \
  --dataset "https://your-docs-host.example/sites/YourSite"
```

Point the OpenAPI client at your Custom Connector / API that reads/writes the Dataverse tables:

```bash
# .env
VITE_DOCUMENT_API_BASE_URL=https://your-api.example.com
```

Optional: add an approvals / SLA notification flow with `pa app add flow`.

## 4. Wire Power Platform app host

```bash
pnpm power:run          # Local Play in the Power Apps host
pnpm power:push         # After build
```

Replace `src/generated/services/SharePointPublishService.ts` with the generated SharePoint service after `pa app add data-source`.

## 5. PDF rendering (server-side)

Do not compile PDFs in the browser bundle.

1. Customize HTML in `src/publishing/html-pdf-template.ts`
2. Keep orchestration in `src/publishing/publish-document.ts`
3. Implement real HTML→PDF (or Typst) on your API / Azure Function / flow
4. Have that service upload to SharePoint and return the file URL

## 6. What you usually should *not* change

- Workflow statuses and transitions (`openapi/document-routing.yaml`) — already generic
- Inbox / workspace views — driven by config + document type
- Pinia Colada / HeyAPI wiring — regenerate with `pnpm generate:api`

## 7. Optional polish

| Need | Where |
| --- | --- |
| Persona inbox labels | `src/config/inbox-personas.ts` |
| Status colors / labels | `src/domain/document-status.ts` |
| Theme colors | `src/plugins/vuetify.ts` |
| Richer demo seed | `src/mock/seed-documents.ts` |

When placeholders are gone, set `features.showSetupBanner: false` in `app.config.ts`.

## 8. Approval queues, SLA, and elevation

Supported out of the box:

| Capability | How |
| --- | --- |
| Named step | `mode: 'named'` in `document-types.ts` |
| Pool / self-assign | `mode: 'pool'` + `pool` members; claim/release in the workspace |
| SLA | `slaHours` on the step; due clock starts when the step activates (or when claimed) |
| Elevation | `elevationPool` merged into the pool when `process-sla` runs after `dueAt` |
| Inbox | **Available in my pool** + **Waiting on me** personas |

Local demo: open **Expense Policy Clarification**, set Acting as `jordan.legal@contoso.com`, click **Process SLA** (seed is already overdue), then **Claim from pool**.

Production schedulers should call `POST /documents/{id}/approvals/process-sla` (or a batch job) from Power Automate / Azure Functions — not from the browser session alone.

## 9. Datastore split

| Store | Use for |
| --- | --- |
| **Dataverse** (`dr_*` tables) | Cases, drafts, approval steps, history, claim/SLA state |
| **SharePoint library** | Published PDF binaries only |

Prefer an API / Custom Connector in front of Dataverse so the Code App keeps the OpenAPI command surface (`claim`, `release`, `decide`, `process-sla`).

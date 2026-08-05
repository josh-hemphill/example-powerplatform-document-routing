# Setup checklist — adopt this app for your org

This starter is designed so most tenant-specific work happens in **two config files**. You should not need to rewrite the workflow UI for a normal document-routing use case.

## 1. Edit org defaults (required)

### `src/config/app.config.ts`

| Field | What to change |
| --- | --- |
| `brand.name` / `brand.tagline` | Product name shown in the shell |
| `sharePoint.siteUrl` | Your SharePoint site URL |
| `sharePoint.libraryName` | Target document library |
| `sharePoint.folderPath` | Default folder (types can override) |
| `localDemoUser` | Fallback identity for local Vite play |
| `features.showSetupBanner` | Set `false` once Contoso placeholders are gone |
| `features.allowApproverOverride` | Let authors edit the default chain at submit time |

### `src/config/document-types.ts`

Add or edit document types. Each type controls:

- Label / description / request hint
- Draft Markdown scaffold (`{{title}}`, `{{request}}`)
- Default ordered **approval chain** (name, email, role)
- Optional SharePoint `folderPath`

Out of the box: `policy`, `sop`, `announcement`.

## 2. Run locally

```bash
pnpm install
pnpm generate:api
pnpm dev
```

Walk the seeded inbox: request → draft → approvals → publish. Seed data lives in `src/mock/seed-documents.ts` (demo only).

## 3. Wire Power Platform (when ready)

```bash
pnpm exec pa auth login
pnpm power:init
pnpm power:run          # Local Play in the Power Apps host
pnpm power:push         # After build
```

Add SharePoint:

```bash
pnpm exec pa app add data-source \
  --connector shared_sharepointonline \
  --connection-id "<connectionId>" \
  --table "Published Documents" \
  --dataset "https://your.sharepoint.com/sites/YourSite"
```

Replace `src/generated/services/SharePointPublishService.ts` with the generated service.

Point the OpenAPI client at your Custom Connector / API:

```bash
# .env
VITE_DOCUMENT_API_BASE_URL=https://your-api.example.com
```

Optional: add an approvals notification flow with `pa app add flow`.

## 4. PDF rendering (server-side)

Do not compile PDFs in the browser bundle.

1. Customize HTML in `src/publishing/html-pdf-template.ts`
2. Keep orchestration in `src/publishing/publish-document.ts`
3. Implement real HTML→PDF (or Typst) on your API / Azure Function / flow
4. Have that service upload to SharePoint and return the file URL

## 5. What you usually should *not* change

- Workflow statuses and transitions (`openapi/document-routing.yaml`) — already generic
- Inbox / workspace views — driven by config + document type
- Pinia Colada / HeyAPI wiring — regenerate with `pnpm generate:api`

## 6. Optional polish

| Need | Where |
| --- | --- |
| Persona inbox labels | `src/config/inbox-personas.ts` |
| Status colors / labels | `src/domain/document-status.ts` |
| Theme colors | `src/plugins/vuetify.ts` |
| Richer demo seed | `src/mock/seed-documents.ts` |

When placeholders are gone, set `features.showSetupBanner: false` in `app.config.ts`.

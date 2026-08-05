# Document Routing — Power Apps Code App (Vue)

Example Power Platform **Code App** that routes freeform document requests through authoring, a chain of approvals, and PDF publish to SharePoint.

**Adopting for your org?** Start with [`SETUP.md`](./SETUP.md) — most changes are limited to `src/config/app.config.ts` and `src/config/document-types.ts`.

Stack:

- **Vue 3 + Vite + TypeScript** hosted as a Power Apps Code App (`@microsoft/power-apps` + `@microsoft/power-apps-vite`)
- **Vuetify** for UI
- **Pinia Colada** for async server-state (queries/mutations)
- **HeyAPI (`@hey-api/openapi-ts`)** to generate a typed SDK + Pinia Colada helpers from OpenAPI
- **Power Apps CLI** via `@microsoft/power-apps-cli` (`pa …` commands; not the older `pac code` group)

## Workflow

```text
Freeform request → Author draft → Approval chain → Approved → Publish PDF → SharePoint
```

1. **Request** — pick a document type, capture unstructured text + SharePoint target  
2. **Draft** — type-specific Markdown scaffold; author fleshes it out  
3. **Approvals** — default chain from the document type (optionally editable)  
4. **Publish** — HTML template hook + SharePoint stub / OpenAPI publish API  

Inbox personas: All · Waiting on me · My requests · Needs draft · Ready to publish.

## Quick start (local)

```bash
pnpm install
pnpm generate:api
pnpm dev
```

Open the Vite URL. A Vite middleware mock implements `openapi/document-routing.yaml` at `/api`, so the full workflow works offline.

```bash
pnpm test
pnpm build
```

## Power Platform publish

1. Enable Code Apps in your environment.
2. Dependencies already include `@microsoft/power-apps` and `@microsoft/power-apps-cli` (`pa`).
3. Copy `power.config.example.json` → `power.config.json` or run `pnpm power:init`.
4. Local play: `pnpm power:run`
5. Build and push: `pnpm power:push`

Use **hash routing** (`createWebHashHistory`) so deep links work when embedded. Do not block first paint on `getContext()`.

> Avoid `pac code …`. Use the npm `pa` CLI instead.

## Connecting data

- Regenerate SDKs after OpenAPI edits: `pnpm generate:api`
- Point at a real API with `VITE_DOCUMENT_API_BASE_URL`
- Add SharePoint with `pa app add data-source` and replace `SharePointPublishService`
- Optional approvals notifications via `pa app add flow`

## PDF generation

Customize `src/publishing/html-pdf-template.ts`. Run HTML→PDF (or Typst) **server-side**; do not compile PDFs in the browser bundle. See SETUP.md for details.

## Project layout

```text
SETUP.md                          Adopter checklist (start here)
src/config/app.config.ts          Brand + SharePoint defaults
src/config/document-types.ts      Types, draft scaffolds, approval chains
src/config/inbox-personas.ts      Inbox persona filters
src/publishing/                   HTML PDF template + publish orchestrator
openapi/document-routing.yaml     OpenAPI contract
src/client/                       Generated SDK (do not hand-edit)
src/mock/                         Local Vite mock + seed data
src/views/                        Inbox, new request, document workspace
```

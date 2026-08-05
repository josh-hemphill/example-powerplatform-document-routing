# Document Routing — Power Apps Code App (Vue)

Example Power Platform **Code App** that routes freeform document requests through authoring, a chain of approvals, and PDF publish to SharePoint.

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

1. **Request** — capture unstructured text, requester, and target SharePoint site/library  
2. **Draft** — author fleshes the request into Markdown content  
3. **Approvals** — ordered multi-step approve/reject chain  
4. **Publish** — render/publish PDF to SharePoint (OpenAPI publish API + SharePoint connector stub)

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
2. Dependencies already include `@microsoft/power-apps` and `@microsoft/power-apps-cli` (`pa`). A global install is optional:

```bash
pnpm add -g @microsoft/power-apps @microsoft/power-apps-cli
```

3. Copy `power.config.example.json` → `power.config.json` or run:

```bash
pnpm power:init
# or: pnpm exec pa app init --display-name "Document Routing" --environment-id <id>
```

4. Local play inside the Power Apps host:

```bash
pnpm power:run
```

5. Build and push:

```bash
pnpm power:push
```

Use **hash routing** (`createWebHashHistory`) so deep links work when embedded. Do not block first paint on `getContext()` — it only resolves inside the Power Apps host.

> Avoid `pac code …`. That Power Platform CLI group is being replaced by the npm `pa` / `power-apps` CLI.

## Connecting SharePoint / Custom APIs

### Document Routing API (HeyAPI)

`openapi/document-routing.yaml` is the contract for request → draft → approvals → publish. Regenerate after edits:

```bash
pnpm generate:api
```

Generated output:

- `src/client/sdk.gen.ts` — typed SDK
- `src/client/@pinia/colada.gen.ts` — `*Query` / `*Mutation` helpers for Pinia Colada

Point at a real Custom Connector / hosted API with:

```bash
VITE_DOCUMENT_API_BASE_URL=https://your-api.example.com
```

### SharePoint connector (Power Apps data source)

After auth + environment select, add SharePoint:

```bash
pnpm exec pa app add data-source \
  --connector shared_sharepointonline \
  --connection-id "<connectionId>" \
  --table "Published Documents" \
  --dataset "https://contoso.sharepoint.com/sites/Policies"
```

Replace `src/generated/services/SharePointPublishService.ts` with the generated service. The workspace publish step shows calling both the OpenAPI publish endpoint and the SharePoint stub.

### Approvals via Power Automate (optional)

You can wrap `submit-for-approval` / `decision` behind a cloud flow that notifies approvers in Teams/Outlook, then add that flow with `pa app add flow` and call it from the Code App.

## PDF generation strategy

The Code App runs in the browser (Power Apps host). Do **not** compile PDFs inside the Vue bundle for production. Call a server (Custom API, Azure Function, Container App, or Power Automate + connector) from `publishDocumentPdf`.

| Approach | Where it runs | Fit for this app |
| --- | --- | --- |
| **HTML → PDF** (Playwright/Puppeteer, or a managed HTML-to-PDF service) | Server | Best default for long-term maintenance when authors already edit HTML/Markdown and designers use CSS |
| **Typst** | Native CLI/Rust, Node napi (`@myriaddreamin/typst-ts-node-compiler`), or browser WASM (`typst-ts-web-compiler`) | Excellent typographic control; use **server-side native/napi**, not the browser WASM path, for publish |
| **Browser WASM Typst** | Client | Possible for previews only; ~12MB payload, slower, awkward fonts — not ideal for SharePoint publish |

**Recommendation:** prefer **server-side HTML → PDF** unless you need Typst-level layout precision (multi-column policies, numbered legal docs, complex floating figures). Typst does **not** require a full desktop OS UI, but production compile should be a Linux container/Function with the Typst CLI or Node napi addon — not something the Code App executes locally in the user’s browser.

## Project layout

```text
openapi/document-routing.yaml     OpenAPI contract
openapi-ts.config.ts              HeyAPI + Pinia Colada generation
src/client/                       Generated SDK (do not hand-edit)
src/mock/                         Local Vite mock of the API
src/views/                        Inbox, new request, document workspace
src/generated/services/           SharePoint connector stub
power.config.example.json         Code App environment binding template
```

## Notes

- Prefer `pnpm` (see `packageManager` in `package.json`).
- Local mock state is in-memory per Vite process.
- The mock publish endpoint returns a SharePoint-like URL; wire real PDF rendering on the API/function side.

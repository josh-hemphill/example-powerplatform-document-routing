# Document Routing — Power Apps Code App (Vue)

Example Power Platform **Code App** that routes freeform document requests through authoring, a chain of approvals, and PDF publish to SharePoint.

Stack:

- **Vue 3 + Vite + TypeScript** hosted as a Power Apps Code App (`@microsoft/power-apps` + `@microsoft/power-apps-vite`)
- **Vuetify** for UI
- **Pinia Colada** for async server-state (queries/mutations)
- **HeyAPI (`@hey-api/openapi-ts`)** to generate a typed SDK + Pinia Colada helpers from OpenAPI

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
2. Install the Power Apps CLI (`npm i -g @microsoft/power-apps @microsoft/power-apps-cli`).
3. Copy `power.config.example.json` → `power.config.json` or run:

```bash
pnpm power:init
# or: pa app init --display-name "Document Routing" --environment-id <id>
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
pac code add-data-source \
  -a "shared_sharepointonline" \
  -c "<connectionId>" \
  -t "Published%20Documents" \
  -d "https://contoso.sharepoint.com/sites/Policies"
```

(or the newer `pa app` equivalents). Replace `src/generated/services/SharePointPublishService.ts` with the generated service. The workspace publish step shows calling both the OpenAPI publish endpoint and the SharePoint stub.

### Approvals via Power Automate (optional)

You can wrap `submit-for-approval` / `decision` behind a cloud flow that notifies approvers in Teams/Outlook, then call that flow from the Code App as another data source.

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
- Production PDF rendering should live in a flow/Azure Function; the mock returns a SharePoint-like URL for the happy path.

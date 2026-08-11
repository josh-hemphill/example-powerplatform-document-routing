# Document Routing — Power Apps Code App (Vue)

Example Power Platform **Code App** that routes freeform document requests through authoring, a chain of approvals, and PDF publish to SharePoint.

**Adopting for your org?** Start with [`SETUP.md`](./SETUP.md) — config in `src/config/*`, deploy scaffolding in [`deploy/`](./deploy/README.md).

**Hardening / Dataverse-first roadmap:** see [`docs/remediation-roadmap.md`](./docs/remediation-roadmap.md) (Phases 0–8). Phases **9–13** — [`docs/post-phase-8-review-roadmap.md`](./docs/post-phase-8-review-roadmap.md). Phases **14–17** implemented — [`docs/post-phase-13-review-roadmap.md`](./docs/post-phase-13-review-roadmap.md) (dirty-state/races, AuthZ fidelity, list performance, UI/a11y).

Stack:

- **Vue 3 + Vite + TypeScript** hosted as a Power Apps Code App (`@microsoft/power-apps` + `@microsoft/power-apps-vite`)
- **Vuetify** for UI
- **Pinia Colada** for async server-state (queries/mutations)
- **HeyAPI (`@hey-api/openapi-ts`)** to generate a typed SDK + Pinia Colada helpers from OpenAPI
- **Power Apps CLI** via `@microsoft/power-apps-cli` (`pa …` commands; not the older `pac code` group)
- **Deploy scaffolding** for Dataverse tables + SharePoint site wiring (custom domains supported)

## Workflow

```text
Freeform request ⇄ Author draft → Approval chain → Approved → Publish PDF → SharePoint
                      ↑                │
                      └─ withdraw/revise (invalidates steps)
                                       └→ rejected → optional revise
```

1. **Request** — pick a document type, capture unstructured text + SharePoint target
2. **Draft** — type-specific Markdown scaffold; collaborative authors co-edit before submit
3. **Approvals** — chain materializes from the document type (override only when enabled); claim/release preserve SLA; named overdue → elevated pool
4. **Publish** — allowlisted destination + server/Flow HTML→PDF (no browser PDF bytes)

Inbox personas: All · Waiting on me · Available in my pool · My requests · Needs draft · Ready to publish.

Approvals support **named** steps and **pool** queues with claim/release, immutable `activateDueAt` SLA, and elevation pools. Live routing is maintained in **Admin** (`#/admin`) / Dataverse control tables — `document-types.ts` is the local seed mirror only. Flow stubs: [`deploy/flows/`](./deploy/flows/README.md).

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
- Scaffold Dataverse + SharePoint wiring: `cp deploy/connections.example.json deploy/connections.json` → edit hosts → `pnpm provision` (see [`deploy/README.md`](./deploy/README.md))
- Point at a real API with `VITE_DOCUMENT_API_BASE_URL` (any HTTPS host)
- SharePoint / Dataverse URLs accept **custom / vanity domains** — nothing assumes `*.sharepoint.com` or `*.dynamics.com`
- Add data sources with generated `deploy/generated/pa-connect.sh` or `pa app add data-source`
- Optional approvals notifications via `pa app add flow`

## PDF generation

Customize `src/publishing/html-pdf-template.ts`. Run HTML→PDF (or Typst) **server-side**; do not compile PDFs in the browser bundle. See SETUP.md for details.

## Project layout

```text
SETUP.md                          Adopter checklist (start here)
docs/remediation-roadmap.md       Phased hardening plan (Dataverse-first)
deploy/                           Dataverse + SharePoint provision scaffolding
deploy/SCHEMA.md                  Control + case table model (collaboration / SLA)
src/config/app.config.ts          Brand + SharePoint defaults (env-overridable)
src/config/document-types.ts      Local/mock type seed (Dataverse is source of truth hosted)
src/config/inbox-personas.ts      Inbox persona filters
src/provisioning/                 Connection validation + Dataverse plan generator
src/publishing/                   HTML PDF template + publish orchestrator
openapi/document-routing.yaml     OpenAPI contract
src/client/                       Generated SDK (do not hand-edit)
src/mock/                         Local Vite mock + seed data
src/views/                        Inbox, new request, document workspace
scripts/provision.ts              pnpm provision / provision:apply CLI
eslint.config.js                  @antfu/eslint-config (org Vue style)
```

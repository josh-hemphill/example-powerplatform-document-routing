# Setup checklist — adopt this app for your org

This starter is designed so most tenant-specific work happens in **deploy scaffolding + Admin control data**. You should not need to rewrite the workflow UI for a normal document-routing use case.

## 1. Connection profile (required)

```bash
cp deploy/connections.example.json deploy/connections.json
```

Set **your** hosts — any HTTPS domain works (vanity SharePoint, custom Dataverse, private API). Do **not** assume `*.sharepoint.com` or `*.dynamics.com`.

| Field                                   | Purpose                                            |
| --------------------------------------- | -------------------------------------------------- |
| `dataverse.environmentUrl`              | Dataverse org URL (custom domains supported)       |
| `sharePoint.siteUrl`                    | Publish site URL (custom / vanity hosts supported) |
| `sharePoint.libraryName` / `folderPath` | Library + default folder                           |
| `api.baseUrl`                           | OpenAPI / Custom Connector base URL                |
| `powerPlatform.environmentId`           | Environment GUID for `pa` commands                 |
| `publisher.prefix`                      | Dataverse publisher prefix (default `dr`)          |

Then generate wiring artifacts:

```bash
pnpm provision
# review deploy/generated/SUMMARY.md
```

Details: [`deploy/README.md`](./deploy/README.md).

## 2. Brand + local env

### `src/config/app.config.ts` / `.env`

| Field / env                      | What to change                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `brand.*`                        | Product name shown in the shell                                                                                                   |
| `VITE_SHAREPOINT_*`              | Local SharePoint defaults (any HTTPS host)                                                                                        |
| `VITE_DATAVERSE_ENVIRONMENT_URL` | Optional org URL for adapters                                                                                                     |
| `VITE_DOCUMENT_API_BASE_URL`     | API / Custom Connector base                                                                                                       |
| `localDemoUser`                  | Fallback identity for local Vite play only (`import.meta.env.DEV`)                                                                |
| Runtime hosts                    | Prefer Dataverse/`dr_*` via `window.__DOCUMENT_ROUTING_ENV__`; `.env` `VITE_*` is local-only — see `src/config/runtime-config.ts` |
| `features.showSetupBanner`       | Set `false` once placeholders are gone                                                                                            |

**Routing policy is not edited in the SPA bundle for production.** Use the in-app **Admin** page (`#/admin`) or provisioned Dataverse control tables.

`features.allowApproverOverride` in `app.config.ts` is only a **seed hint**. Runtime value lives in control settings (`appsetting` / Admin → Settings), default **off** (submit materializes chains from control data).

## 3. Document types, pools, destinations

### Production / hosted

1. Run `pnpm provision` to seed control tables from `deploy/generated/control-seed.json`.
2. Assign the **Document Routing Admin** security role ([`deploy/SECURITY_ROLES.md`](./deploy/SECURITY_ROLES.md)).
3. Open **Admin** in the Code App and maintain:
   - Document types + approval chains (`poolKey` references)
   - Approver pools & members
   - Allowlisted publish destinations
   - Feature flags (`allowApproverOverride`)
4. Next **submit-for-approval** uses the live pool membership — no app rebuild.

### Local / mock seed mirror

`src/config/document-types.ts` remains the **dev seed** used to bootstrap the Vite mock control store and `pnpm provision` seed JSON. Prefer Admin for day-to-day edits even locally (persona: Local developer).

Schema: [`deploy/SCHEMA.md`](./deploy/SCHEMA.md).

## 4. Run locally

```bash
pnpm install
pnpm generate:api
pnpm dev
```

Walk the seeded inbox: request → draft → approvals → publish. Demo cases live in `src/mock/seed-documents.ts`. Use the persona switcher; only **Local developer** has Admin.

## 5. Provision Dataverse + connect SharePoint

### Create tables

```bash
pnpm provision
export DATAVERSE_ACCESS_TOKEN='…'
pnpm provision:apply
```

This scaffolds case tables plus control tables (`documenttype`, `approvalchainstep`, pools, destinations, `appsetting`). See [`deploy/README.md`](./deploy/README.md).

### Attach Code App data sources

```bash
pnpm exec pa auth login
pnpm power:init
bash deploy/generated/pa-connect.sh
```

Point the OpenAPI client at your Custom Connector / API:

```bash
# .env
VITE_DOCUMENT_API_BASE_URL=https://your-api-host.example/document-routing
```

## 6. Power Automate

Import stubs from [`deploy/flows/`](./deploy/flows/README.md) (SLA sweeper, notify, publish, on-submit guard). Admin → Flow health shows recent mock/hosted run rows.

## 7. Security roles

Map Entra groups to Document Routing User / Author / Approver / Publisher / Admin as described in [`deploy/SECURITY_ROLES.md`](./deploy/SECURITY_ROLES.md).

## 8. Checklist before go-live

- [ ] Contoso/example emails removed from control tables / Admin pools
- [ ] Publish destinations allowlist matches real HTTPS sites
- [ ] `allowApproverOverride` left off unless intentionally enabled by Admin
- [ ] Setup banner disabled
- [ ] Flows deployed and healthy

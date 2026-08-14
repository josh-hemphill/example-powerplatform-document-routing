# Setup checklist — adopt this app for your org

This starter is designed so most tenant-specific work happens in **deploy scaffolding + Admin control data**. You should not need to rewrite the workflow UI for a normal document-routing use case.

**Shared Power Platform org?** Start with [`deploy/SHARED_ENV.md`](./deploy/SHARED_ENV.md) (publisher → solution → connection refs → roles → managed import).

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

| Field / env                      | What to change                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `brand.*`                        | Product name + tagline shown in the shell                                                                                               |
| `VITE_SHAREPOINT_*`              | Local SharePoint defaults (any HTTPS host)                                                                                              |
| `VITE_DATAVERSE_ENVIRONMENT_URL` | Optional org URL for adapters                                                                                                           |
| `VITE_DOCUMENT_API_BASE_URL`     | API / Custom Connector base                                                                                                             |
| `VITE_LOCAL_DEMO_*`              | **DEV only** — email / display name / roles for the primary local persona (see below)                                                   |
| `localDemoUser`                  | Code defaults for the same identity when env is unset (`import.meta.env.DEV` / standalone only)                                         |
| Runtime hosts                    | Prefer Dataverse `{prefix}_*` via `window.__DOCUMENT_ROUTING_ENV__`; `.env` `VITE_*` is local-only — see `src/config/runtime-config.ts` |
| `features.showSetupBanner`       | Set `false` once placeholders are gone                                                                                                  |

**Routing policy is not edited in the SPA bundle for production.** Use the in-app **Admin** page (`#/admin`) or provisioned Dataverse control tables.

`features.allowApproverOverride` in `app.config.ts` is only a **seed hint**. Runtime value lives in control settings (`appsetting` / Admin → Settings), default **off** (submit materializes chains from control data).

### Local Admin in Dev

Hosted production Admin requires the Dataverse **Document Routing Admin** security role (see [`deploy/SECURITY_ROLES.md`](./deploy/SECURITY_ROLES.md)).

For **local Vite** (`pnpm dev`, standalone / no Power Apps host):

1. Stay on the **Local developer** persona (or your `VITE_LOCAL_DEMO_*` override) — it includes `admin` by default.
2. Open `#/admin` from the nav (visible only when the identity has `admin`).
3. Optional: put your own identity in `.env.local` so seeds and the persona switcher match you:

```bash
cp .env.example .env.local
# edit:
# VITE_LOCAL_DEMO_EMAIL=you@contoso.com
# VITE_LOCAL_DEMO_USER_NAME=Your Name
# VITE_LOCAL_DEMO_ROLES=user,author,approver,publisher,admin
```

`VITE_LOCAL_DEMO_*` is ignored when the app is hosted in Power Apps. Without `admin` in `VITE_LOCAL_DEMO_ROLES`, `#/admin` stays hidden and returns you to Inbox.

## 3. Document types, pools, destinations

### Production / hosted

1. Run `pnpm provision` (shared-env safe seed by default). Contoso demo identities require `pnpm provision -- --demo-seed` and must not be imported into shared orgs.
2. Assign the **Document Routing Admin** security role ([`deploy/SECURITY_ROLES.md`](./deploy/SECURITY_ROLES.md) + generated `security-roles.md`).
3. Open **Admin** in the Code App and maintain:
   - Document types + approval chains (`poolKey` references)
   - Approver pools & members
   - Allowlisted publish destinations
   - Feature flags (`allowApproverOverride`)
4. Next **submit-for-approval** uses the live pool membership — no app rebuild.

Production `GET /principal` must return the Dataverse role **display names** listed in `security-roles.md` (mapping in `src/domain/security-roles.ts`).

### Local / mock seed mirror

`src/config/document-types.ts` remains the **dev seed** used to bootstrap the Vite mock control store. Prefer Admin for day-to-day edits even locally (persona: Local developer).

Schema: [`deploy/SCHEMA.md`](./deploy/SCHEMA.md).

## 4. Run locally

```bash
pnpm install
pnpm generate:api
pnpm dev
```

Walk the seeded inbox: request → draft → approvals → publish. Demo cases live in `src/mock/seed-documents.ts` (mock/DEV only — not used by hosted Dataverse). Use the persona switcher; only the **Local developer** persona (or your `VITE_LOCAL_DEMO_*` override with `admin`) can open Admin. See **Local Admin in Dev** above.

## 5. Provision Dataverse + connect SharePoint

### Create tables (solution-first)

```bash
pnpm provision
export DATAVERSE_ACCESS_TOKEN='…'
pnpm provision:solution                    # ensure publisher + unmanaged solution
pnpm provision:apply -- --into-solution    # optional: apply schema into that solution
# Scratch only: pnpm provision:apply -- --unmanaged-ok
```

This scaffolds case tables plus control tables (`documenttype`, `approvalchainstep`, pools, destinations, `appsetting`). Shared orgs should prefer the solution path — see [`deploy/README.md`](./deploy/README.md) and [`deploy/SHARED_ENV.md`](./deploy/SHARED_ENV.md).

### Promote managed

```bash
pnpm provision:export
pnpm provision:pack
pnpm provision:import
```

### Attach Code App data sources

```bash
pnpm exec pa auth login
pnpm power:init
bash deploy/generated/pa-connect.sh   # bind CONNECTION_ID to the solution connection reference
```

## 6. Security roles + Flow service principal

See [`deploy/SECURITY_ROLES.md`](./deploy/SECURITY_ROLES.md). SLA/publish flows need a **Document Routing Service** principal — do not elevate with the SPA token.

## 7. Go-live checklist

- [ ] Real hosts in `connections.json` (no `REPLACE_ME` / example placeholders)
- [ ] Publisher prefix reserved; solution unique name unique in the org
- [ ] Connection references bound per environment
- [ ] Security roles created/assigned; `/principal` returns display names
- [ ] Env var current values set; Contoso seed not imported to shared orgs
- [ ] Flows imported from `deploy/generated/flows/` (or packaged in the solution)

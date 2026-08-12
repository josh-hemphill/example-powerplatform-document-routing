# Shared-environment adopter checklist

Use this when landing Document Routing in a **busy shared Power Platform environment** beside other teams’ solutions. You should not need to read the provisioning TypeScript.

## 1. Reserve publisher + solution

1. Confirm a unique `publisher.prefix` (2–8 letters) with platform owners — collision fails closed on `pnpm provision:solution`.
2. Set `publisher.uniqueName` / `friendlyName` and `solution.uniqueName` / `version` in `deploy/connections.json`.
3. Copy from the example if needed: `cp deploy/connections.example.json deploy/connections.json`.

## 2. Generate artifacts (no live org required)

```bash
pnpm provision
# review deploy/generated/SUMMARY.md, security-roles.md, flows/, connection-references.json
```

Default `control-seed.json` **omits Contoso demo emails**. Local demos only: `pnpm provision -- --demo-seed`.

## 3. Ensure publisher + unmanaged solution

```bash
export DATAVERSE_ACCESS_TOKEN='…'
pnpm provision:solution
```

## 4. Apply schema into the solution (dev)

```bash
pnpm provision:apply -- --into-solution
```

Avoid unmanaged apply in shared orgs. Scratch only: `pnpm provision:apply -- --unmanaged-ok`.

## 5. Bind connection references

1. Create a SharePoint connection in the environment.
2. Bind it to `{prefix}_sharepoint` (see `connection-references.json` / `pa-connect.sh`).
3. Bind `{prefix}_dataverse` for flows / solution-aware apps when used.

## 6. Security roles + Flow service principal

1. Create the five **Document Routing \*** roles from `deploy/generated/security-roles.md` **inside** the solution.
2. Assign via **teams** where possible (authors/approvers rotate).
3. Configure a **Document Routing Service** account (or Admin + dedicated service principal) for SLA/publish flows — **never** the end-user SPA token.
4. Production `GET /principal` must return those role **display names** (mapping in `src/domain/security-roles.ts`).

## 7. Flows

Import prefix-correct stubs from `deploy/generated/flows/` (generated from `deploy/flows/` templates). Prefer packaging flows into the solution over manual rebind after every prefix change.

## 8. Promote managed to shared test/prod

```text
unmanaged (personal/dev) → export → pack managed → import shared test/prod
```

```bash
pnpm provision:export
pnpm provision:pack
pnpm provision:import
```

Bump `solution.version` in `deploy/connections.json` before each shared import.

## 9. Smoke-test

1. Set env var **current values** per environment (`environment-variable-values.md`).
2. Load control data via **Admin** (real pools/members — not Contoso).
3. Walk request → draft → approve → publish in the Code App.

## Related

- [`README.md`](./README.md) — deploy scaffolding overview
- [`SECURITY_ROLES.md`](./SECURITY_ROLES.md) — role intent + hosted identity notes
- [`../docs/provisioning-alm-roadmap.md`](../docs/provisioning-alm-roadmap.md) — Phases 18–22
- [`../SETUP.md`](../SETUP.md) — full adopter setup

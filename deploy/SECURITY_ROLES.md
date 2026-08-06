# Dataverse security roles — Document Routing

Assign these security roles (or equivalent privilege sets) in the Dataverse
environment. The Code App gates UI from host identity + mapped roles;
**enforcement** belongs in Dataverse privileges + Power Automate.

| Role                           | Typical privileges                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| **Document Routing User**      | Create `document` (own); read shared / owned cases; create requests                |
| **Document Routing Author**    | Read/write draft fields on shared `requested`/`drafting` documents; append history |
| **Document Routing Approver**  | Update eligible `approvalstep` rows (claim/decide); read case                      |
| **Document Routing Publisher** | Update publish fields / trigger publish Flow on `approved` documents               |
| **Document Routing Admin**     | CRUD control tables (`documenttype`, pools, destinations, `appsetting`); Admin UI  |

## Hosted identity (Phase 9)

On successful Power Apps `getContext()`, the app defaults to **`user` only** until
Dataverse security roles are resolved. Host context does **not** include security
roles; call `applyHostedSecurityRoles([...])` (or a future Dataverse role fetch)
with the display names above. Mapping lives in `src/domain/security-roles.ts`.

Hosted builds never grant publisher/approver/admin by hardcoding. A host-context
**timeout** fails identity (with retry) and does **not** install the local demo
Admin persona — even in DEV. Demo fallback applies only when `getContext()`
**rejects** (no host plugin) and `import.meta.env.DEV` is true.

Admin route `#/admin` is guarded with `meta.requiresAdmin` (router `beforeEach`)
in addition to the Admin view check.

## Collaborative drafts

Documents are **user-owned**. On create, share with the document type’s **author
collaboration team** (`authorteamexternalid` / mock `authorTeamEmails`) so peers
can open inbox **Needs draft** and co-edit markdown **before** submit.

Identity for mutations must come from the **caller principal** (Power Apps host /
Dataverse user). Never accept `actorEmail` / spoofable identity in request bodies.

## Local mock headers (not a production trust boundary)

The Vite mock accepts:

| Header                     | Purpose                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `X-Document-Routing-Actor` | Email/UPN stand-in for the caller                                                                            |
| `X-Document-Routing-Roles` | Comma-separated role tokens (`user`, `author`, `approver`, `publisher`, `admin`, optional `service` for SLA) |

The SPA sets these from the identity store for **local play only**. Production
APIs **must ignore** both headers and derive principal + roles from the token /
Dataverse. Never treat client-supplied roles as authoritative when hosted.

In DEV only, a persona switcher changes the store — **Local developer** includes
`admin` (and publisher); other personas do not.

### Privileged mock checks

- **Publish:** `publisher` or `admin` **and** `canActorAccessDocument` (case membership).
- **Process SLA:** `admin`, `service` role token, or actor `system@sla-processor` (Flow). End-user UI shows Process SLA only for Admin.
- **Admin control APIs / `#/admin`:** `admin` role.

Admin UI: `#/admin` (nav only when `admin` role is present).

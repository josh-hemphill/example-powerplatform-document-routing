# Dataverse security roles — Document Routing

Assign these security roles (or equivalent privilege sets) in the Dataverse
environment. The Code App gates UI from host identity + mapped roles;
**enforcement** belongs in Dataverse privileges + Power Automate.

> **Generated matrix:** After `pnpm provision`, see
> [`deploy/generated/security-roles.md`](./generated/security-roles.md) and
> `security-roles.json` for **prefix-correct** table logical names. Display names
> below stay stable so `/principal` mapping does not depend on `publisher.prefix`.

| Role                           | Typical privileges                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| **Document Routing User**      | Create `document` (own); read shared / owned cases; create requests                |
| **Document Routing Author**    | Read/write draft fields on shared `requested`/`drafting` documents; append history |
| **Document Routing Approver**  | Update eligible `approvalstep` rows (claim/decide); read case                      |
| **Document Routing Publisher** | Update publish fields / trigger publish Flow on `approved` documents               |
| **Document Routing Admin**     | CRUD control tables (`documenttype`, pools, destinations, `appsetting`); Admin UI  |

## Shared-environment assignment

- Create roles **inside** your unmanaged solution (see [`SHARED_ENV.md`](./SHARED_ENV.md)).
- Prefer **Dataverse / Entra teams** over one-off user assignments when authors and approvers rotate.
- Publishers and Approvers still need case access (ownership or share) in addition to the role.

## Service / Flow principal

SLA sweeper and publish flows must run as a **Document Routing Service** account
(or Admin + dedicated service principal) with an elevated Dataverse connection.
Do **not** invent SPA-token elevation — the Code App only triggers privileged work
by writing Dataverse status fields or calling a Custom Connector that starts a flow.

## Hosted identity (Phase 9)

On successful Power Apps `getContext()`, the app defaults to **`user` only**, then
calls **`GET /principal`** to load server-derived roles (`refreshHostedRoles`).
Host context does **not** include security roles. Production `/principal` should
return Dataverse security role **display names** (or mapped tokens); the mock resolves
roles from a server-side email directory and **ignores** client role headers on
that request.

You can also call `applyHostedSecurityRoles([...])` with Dataverse display names
when a connector surfaces them directly. Mapping lives in
`src/domain/security-roles.ts`.

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

In DEV only, a persona switcher changes the store — the **Local developer** persona
includes `admin` (and publisher) by default; other Contoso personas do not.

To act as yourself locally (email, display name, roles), set in `.env.local`:

```bash
VITE_LOCAL_DEMO_EMAIL=you@contoso.com
VITE_LOCAL_DEMO_USER_NAME=Your Name
VITE_LOCAL_DEMO_ROLES=user,author,approver,publisher,admin
```

Roles accept app tokens (`admin`) or Dataverse display names (`Document Routing Admin`).
In DEV Local Play, when the host UPN matches `VITE_LOCAL_DEMO_EMAIL` (or another
demo persona), those persona roles apply even while identity status is `hosted`.
Production / unknown emails still use Dataverse roles from `GET /principal`.
Without `admin`, `#/admin` is hidden and guarded.

### Privileged mock checks

- **Publish:** `publisher` or `admin` **and** `canActorAccessDocument` (case membership).
- **Process SLA:** `admin`, `service` role token, or actor `system@sla-processor` (Flow). End-user UI shows Process SLA only for Admin.
- **Admin control APIs / `#/admin`:** `admin` role.

Admin UI: `#/admin` (nav only when `admin` role is present).

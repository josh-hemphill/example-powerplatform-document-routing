# Dataverse security roles — Document Routing

Phase 2 sketch. Assign these security roles (or equivalent privilege sets) in the
Dataverse environment. The Code App gates UI from host identity; **enforcement**
belongs in Dataverse privileges + Power Automate (Phase 3+).

| Role                           | Typical privileges                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| **Document Routing User**      | Create `document` (own); read shared / owned cases; create requests                |
| **Document Routing Author**    | Read/write draft fields on shared `requested`/`drafting` documents; append history |
| **Document Routing Approver**  | Update eligible `approvalstep` rows (claim/decide); read case                      |
| **Document Routing Publisher** | Update publish fields / trigger publish Flow on `approved` documents               |
| **Document Routing Admin**     | CRUD control tables (`documenttype`, pools, destinations, `appsetting`)            |

## Collaborative drafts

Documents are **user-owned**. On create, share with the document type’s **author
collaboration team** (`authorteamexternalid` / mock `authorTeamEmails`) so peers
can open inbox **Needs draft** and co-edit markdown **before** submit.

Identity for mutations must come from the **caller principal** (Power Apps host /
Dataverse user). Never accept `actorEmail` / spoofable identity in request bodies.

## Local mock

The Vite mock accepts `X-Document-Routing-Actor` (email/UPN) and
`X-Document-Routing-Roles` (comma-separated) as stand-ins for the host principal.
The SPA sets these from the identity store. In DEV only, a persona switcher changes
the store — **Local developer** includes `admin`; other personas do not.

Admin UI: `#/admin` (nav only when `admin` role is present).

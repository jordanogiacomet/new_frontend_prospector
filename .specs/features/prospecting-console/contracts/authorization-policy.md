# Authorization Policy

**Status:** APPROVED FOR IMPLEMENTATION — identity-provider role assignment
pending

## Verified Actor Context

The server context must retain:

```ts
interface AuthorizedActor {
  issuer: string;
  subject: string;
  organizationId: string;
  permissions: readonly Permission[];
}
```

Values come only from verified identity-provider claims and server-side policy.
The current API context returns only `{ status: "authorized" }`; that is
adequate for read-only access but not app-owned write auditing.

## Proposed Permissions

| Permission | Capability |
| --- | --- |
| `leads:read` | Read approved lead list/detail/history |
| `imports:read` | Read app submissions and approved producer observations |
| `imports:create` | Submit one controlled import |
| `commercial:read` | Read app-owned queue, assignment, and activity |
| `commercial:write` | Change app-owned commercial state |
| `commercial:assign` | Claim, assign, or reassign a commercial workspace |
| `sensitive:read` | Read separately approved contacts/reports/evidence |
| `audit:read` | Read approved app audit metadata |

Permissions are independent. `imports:create` does not imply
`commercial:write` or `sensitive:read`.

`commercial:write` permits stage, next action, activity, and note operations
within the approved organization. Assignment changes additionally require
`commercial:assign`.

## Enforcement Rules

- Authentication and authorization run before body parsing, database work,
  hashing, file handling, or producer calls where the framework permits.
- Organization scope comes from the verified actor.
- Client-supplied actor, organization, role, or permission fields are ignored
  and rejected when present in mutation payloads.
- API and page authorization are both server-side.
- Deny by default for unknown permissions and roles.
- Sensitive-content access is checked at response mapping, not only UI
  rendering.
- Private responses use `Cache-Control: private, no-store`.
- Authorization failures return safe `401`/`403` envelopes.

## Audit Rules

Every app-owned write records:

- issuer and subject;
- organization;
- permission-authorized action;
- target type and app-owned target ID;
- referenced `lead_run_id`, when applicable;
- UTC timestamp;
- request correlation ID;
- allowlisted before/after metadata.

Do not audit secrets, session tokens, SQL parameters, CSV content, contact
values, notes, report text, or evidence bodies in general-purpose logs.

## Role Assignment

Application code consumes permissions, not provider-specific role names. The
role claim name and role-to-permission assignment are server-owned
configuration and deny by default. The following permission bundles are the
implementation model; identity owners must map exact provider roles before
integration:

| Bundle | Permissions |
| --- | --- |
| Reader | `leads:read`, `imports:read`, `commercial:read` |
| Seller | Reader + `commercial:write` |
| Manager | Seller + `imports:create`, `commercial:assign` |
| Auditor | `leads:read`, `imports:read`, `commercial:read`, `audit:read` |
| Sensitive overlay | `sensitive:read`, assigned only after data-policy approval |

No bundle automatically grants `sensitive:read` in production. Its provider
assignment, revocation latency, emergency access, and audit-reader eligibility
remain external approval gates.

## Verification

- Missing and expired sessions return `401`.
- Wrong issuer/organization and absent permissions return `403`.
- Identity fields survive from token validation to the audit transaction.
- Cross-organization identifiers fail closed.
- Sensitive mappers withhold content without `sensitive:read`.
- Revoked permissions are not accepted after the approved session lifetime.

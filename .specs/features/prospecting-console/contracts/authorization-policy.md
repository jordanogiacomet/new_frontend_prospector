# Authorization Policy

**Status:** AUTHENTICATION AND ORGANIZATION BOUNDARY IMPLEMENTED — scoped
internal import access approved; granular authorization deferred

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
The API guard now returns the verified actor to server-side route/service code;
routes do not serialize that context into responses or errors.

In the current phase, only issuer, subject, and `AUTH_ALLOWED_ORG_ID` are used
to authorize a private session. Provider role claims and client/token
permission fields are ignored. `permissions` is retained as a future contract
slot and is always `[]` for OIDC and development actors.

## Deferred Permission Vocabulary

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

These names are reserved for the future granular-authorization gate. They do
not grant capabilities in the current runtime, and no provider role is mapped
to them.

## Scoped Internal Import Access

For the identified single-organization internal MVP only, import pages and
routes may use the existing verified issuer, subject, and
`AUTH_ALLOWED_ORG_ID` actor as their server-side access policy. Mutations also
require the same-origin guard, and every import route requires the server-side
import feature flag.

This exception:

- applies only to import submission and app-owned import facts;
- grants no sensitive, commercial, assignment, or audit capability;
- does not trust provider roles, token permissions, or request-body actor/org
  fields;
- remains disabled by default and is not a production authorization model.

## Enforcement Rules

- Authentication and authorization run before body parsing, database work,
  hashing, file handling, or producer calls where the framework permits.
- Current lead list/detail/history routes require a valid authenticated session
  whose issuer and organization match server policy. They do not consume a
  provider role or granular permission.
- Internal import routes may use the same actor boundary only under the scoped
  internal import access policy above.
- Mutation routes must apply the reusable same-origin guard after
  current authentication/organization authorization and before body
  processing. Once granular authorization is approved, its permission check
  must occur in the same auth-first position. Missing, malformed, or
  mismatched `Origin` headers fail closed; body fields are never an origin
  authority.
- Organization scope comes from the verified actor.
- Client-supplied actor, organization, role, or permission fields are ignored
  and rejected when present in mutation payloads.
- API and page authorization are both server-side.
- Provider roles are not requested, mapped, or trusted in this phase.
- `requirePermission` remains deny-by-default infrastructure and is not used
  by current lead routes while the permission source is unresolved.
- Sensitive-content access is checked at response mapping, not only UI
  rendering after the granular-authorization and data-policy gates pass.
- Private responses use `Cache-Control: private, no-store`.
- Authorization failures return safe `401`/`403` envelopes.

## Audit Rules

Every app-owned write records:

- issuer and subject;
- organization;
- authorized action and authorization-policy basis;
- target type and app-owned target ID;
- referenced `lead_run_id`, when applicable;
- UTC timestamp;
- request correlation ID;
- allowlisted before/after metadata.

Do not audit secrets, session tokens, SQL parameters, CSV content, contact
values, notes, report text, or evidence bodies in general-purpose logs.

## Deferred Granular Authorization Gate

`AUTH_ROLE_CLAIM` and `AUTH_ROLE_MAPPING` are not runtime configuration in this
phase. They are absent from the parsed environment, commented in
`.env.example`, and must not be used to grant access.

Before any route depends on a granular permission, identity and security owners
must approve and test the permission source, assignment semantics, revocation
latency, organization binding, emergency access, and audit behavior. That
future mechanism may use provider roles or another server-owned source, but no
choice is made by the current implementation.

The scoped internal import policy does not depend on or populate a granular
permission and therefore does not claim to satisfy this gate.

## Verification

- Missing and expired sessions return `401`.
- Wrong issuer/organization returns `403`.
- OIDC role claims and stale token permissions do not change current access or
  populate actor permissions.
- Identity fields survive from token validation to the audit transaction.
- Cross-organization identifiers fail closed.
- Internal import routes require the allowed-organization actor, feature flag,
  and same-origin guard before file, database, hashing, or producer work.
- Sensitive and other granular capabilities remain feature-gated until their
  permission source and revocation behavior are approved.

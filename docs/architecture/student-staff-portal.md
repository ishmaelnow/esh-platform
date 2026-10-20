# Student staff portal

Owner approved consolidation on 2026-10-20. Local implementation starts from owner-deployed
519320b, the GitHub-delivered revert of 510fab1. This is navigation/session consolidation and
safe load diagnostics, not a fix claimed for the hosted HTTP 401 or a restoration of reverted
policy-save behavior.

## Two audiences

The school customer portal remains /school, with existing invitation acceptance, address search,
request submission/history/withdrawal and customer-only admission. The internal portal is /admin,
titled Staff portal, with Requests and planning, Enrollment, and Administration sections. The home
entry says Staff portal. Legacy /clients redirects to /admin; /enrollment redirects to
/admin?section=enrollment. Only allowlisted section names are accepted. No arbitrary return URL.

Staff email links retain the existing exact same-origin /admin destination. Customer/invitation
links retain /school. No hosted URL allowlist, shared Site URL, email template, credential or
environment change is required. No migration, new product, native build, dispatch or notification
contract change. RLS/RPCs and admission gates remain authoritative; URLs/navigation confer no roles.

## Shared staff shell

StaffPortal owns the sole active auth client, session, staff-context bootstrap, sign-out, navigation
and Operating business selector. Embedded customer/enrollment components use that client/session
and selected tenant rather than mounting separate sign-in or tenant selectors. The existing
esh-student-transportation-auth storage key is preserved. Student data and selected business stay
in memory, not in new browser storage. Server authorization still runs for every read/write.

On initial load prefer an enabled business with reviewer/enrollment admission; otherwise use the
first eligible business. This avoids defaulting to an unrelated disabled pilot merely because it
appears first. Never infer a preferred business from email or grant authority. Explicit selection
persists between sections for the current session; it is cleared on identity changes. Refresh
rechecks access and unmounts private workspaces while loading. Revocation/failure clears private
data; stale generation reads are discarded. Tenant changes key/remount child workspaces and clear
unsaved entries and map/planning state. A visible reminder asks staff to save before switching.
In-flight workspace actions (including nested planning actions) disable shell navigation, business
selection, refresh and sign-out until settled, retaining existing per-form retry state.

Requests and planning retains existing customer management and route-planning review gates.
Enrollment is visible for admitted enrollment staff/reviewers, with Manage and Review controls
when both permissions exist. Administration is visible only with configuration authority and
does not load/display child enrollment records merely because the owner can manage access.
Organization ownership still does not imply reviewer/child access. Setup/review mutations retain
their existing audit/idempotency/RPC implementations. No new grants or cross-tenant query scope.

## Safe failure reporting

Context/child-load errors show a fixed operation label, HTTP status and a bounded uppercase error
code where provided, e.g. Load staff access: Authentication was rejected. (HTTP 401 / PGRST301).
Provider messages, details, headers, JWTs/API keys and student payloads are not displayed. Missing
keys, rejected tokens and expired tokens map to fixed safe messages when the provider identifies
them; arbitrary provider text is never echoed. Missing
admission is shown only after a successful context response with no eligible businesses. An API
failure must not masquerade as "No account access" or an empty request queue.

The known live 401 for Student RPCs and native-push worker remains unresolved. SQL-owner context
and authenticated execute checks pass; these do not establish browser JWT/key validity. This
release exposes a safe diagnostic reference without changing keys, roles or billing. No logs or
responses should be pasted wholesale. A 402 is distinguished if encountered; no 402 was captured
in the owner's supplied logs.

## Verification

Local intercepted browser fixtures cover the real SDK consuming a callback, one sign-in/tenant
selector, legacy aliases, role-gated sections, correct default business, cross-section/tenant
clearing, denied context, sanitized 401, sign-out and mobile/desktop overflow. Existing customer
address search, enrollment lifecycle/governance and planning browser regressions remain relevant.
They do not certify provider delivery, hosted credentials or live Student acceptance. No production
data, emails, account grants, Git mutation or deployment is performed by Codex.
Eight scoped unit checks, the staff/enrollment/customer/planning browser regressions, enabled and
default-off production builds/lint/types and all 21 closed-shell viewport checks pass locally.
The in-flight governance test verifies navigation/tenant/sign-out blocking until completion.
Complete 414px screenshot inspected under ignored tmp/student-staff-evidence. Existing build
warnings remain; hosted 401 and policy-save acceptance remain unresolved owner checkpoints.

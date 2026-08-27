# Phase 1C-5R2E-2F2B-R1 Dataverse Authentication And Connectivity Recovery

## Decision

- `Dataverse Authentication Ready=true`
- Location Apply may resume only under a separate 2F2B-R2 authorization.
- This phase performed no Location create, component change, publish, or business write.

## Previous Failure

The failed import used the repository's existing MSAL confidential-client
implementation with a Service Principal and client secret. The authority host was
`login.microsoftonline.com`; the resource was the approved test Dataverse host.

- Error type: MSAL `AuthError` / `network_error`
- Inner result: Node `fetch failed`
- Stage: token acquisition, before an access token was returned
- Dataverse request reached: no
- HTTP status: unavailable because the identity request did not complete
- Observed retry count: 0 automatic retries; one failed token-acquisition invocation
- Observed failure window: approximately 2026-07-14 07:01 UTC
- Secret, token, Authorization header and Cookie disclosure: none

The available failure did not identify a DNS, TLS or HTTP response error. The
subsequent diagnostics indicate a transient identity-endpoint or local proxy
network interruption rather than invalid Dataverse credentials.

## Authentication Method

The application uses `@azure/msal-node` `ConfidentialClientApplication` and
`acquireTokenByClientCredential`. It does not use PAC, Azure CLI, device code,
interactive browser authentication, or browser Cookies. Existing local
configuration was reused without alteration.

The access token remains in process memory and MSAL's supported runtime handling.
No token, client secret, tenant ID, cookie, or credential value was written to
source, logs, this report, or Git.

## Network Diagnostics

Diagnostics were limited to the approved Dataverse hostname and the identity host.

| Check | Dataverse | Microsoft identity |
| --- | --- | --- |
| DNS | Resolved | Resolved |
| HTTPS 443 | Connected | Connected |
| TLS verification | Passed | Passed |
| HTTP probe | 302 organization root | 200 OpenID configuration |

- Local UTC time: 2026-07-14 07:06; local timezone offset: +08:00
- Node.js: v26.0.0
- Proxy environment: HTTP and HTTPS proxy variables are set
- Curl connected through the local proxy endpoint; certificate verification passed
- No TLS bypass, certificate suppression, unrelated-domain probe, VPN change, or
  global proxy/authentication change was performed

Node used the existing process environment and successfully completed MSAL token
acquisition after the connectivity probe. This confirms the current Node process
can use the configured network path.

## Read-Only Dataverse Verification

The following approved-host GET operations succeeded:

1. `WhoAmI`: user, business unit and organization identifiers were returned.
2. Organization: one organization matched the `WhoAmI` organization ID.
3. `aigw_location` Metadata: Organization-owned, primary name `aigw_name`, primary
   ID `aigw_locationid`, Entity Set `aigw_locations`.
4. Location row count: 0.
5. Opportunity Lookup Metadata: `aigw_opportunitylocation`, type Lookup,
   readable, target `aigw_location`.

Two preliminary Organization GETs returned HTTP 400 because unsupported
`uniquename` and `version` properties were requested. Both occurred after
successful token acquisition, involved no write, and were corrected by using the
actual readable Organization attributes.

## Protection Verification

- Full Replica: 5 tabs / 19 sections / 115 controls / 106 unique fields
- New Location Lookup controls: 1; old String controls: 0
- Native Timeline: 1; old Timeline: 0
- Protected Form XML hash:
  `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7`
- Protected Form JSON hash:
  `94de2fe47db7300420c7fcf73c6c1ff24d830aefea9f4a1a765daf4cd728b8f9`
- Plugin protection gate: 7 enabled / 0 disabled
- BPF: Draft / Inactive
- POL/POD table and Modern App baseline: unchanged
- Location rows: 0
- Opportunity writes: 0
- Publish: 0
- Production requests: 0

## Request Accounting

```text
Dataverse GET=24
POST=0
PATCH=0
DELETE=0
Publish=0
Business writes=0
Production requests=0
```

The total includes five final connectivity GETs, fifteen protection-gate GETs,
and four preliminary read-only GET attempts. DNS and HTTPS probes are not counted
as Dataverse API requests.

## Recovery Boundary

Authentication and read-only connectivity are currently healthy. A separately
authorized 2F2B-R2 run may begin with a fresh Location dry-run and may then use the
idempotent importer. This phase does not authorize or perform that Apply.

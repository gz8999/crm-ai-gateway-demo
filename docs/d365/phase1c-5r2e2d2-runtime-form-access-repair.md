# Phase 1C-5R2E-2D2 Runtime Form Access Repair

## Result

**Runtime Form Access Repair Ready=false.** The Full Replica access condition was updated in the unpublished definition to the test user's direct System Administrator role, but the single authorized entity-scoped Opportunity `PublishXml` request was rejected with HTTP 429 because another Solution Uninstall was running. No publish retry was made and browser runtime validation was not started.

The platform's supported form-access model is security-role based: a form can be available to Everyone or to specific security roles, and a fallback form must remain available for users without an assigned form. This repair intentionally selected the existing System Administrator role only, did not use Basic User, and left the Full Replica non-default and non-fallback. See [Control access to model-driven app forms](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/control-access-forms) and [RetrieveFilteredForms](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrievefilteredforms?view=dataverse-latest).

## Identity And Role

| Item | Value |
|---|---|
| Test user | Zhou Wenzhe |
| `systemuserid` | `df4b1a2f-cd6d-f111-ab0d-00224818ead9` |
| Business unit | `org91f5f65f` (`4c441a2f-cd6d-f111-ab0d-00224818ead9`) |
| Selected role | System Administrator |
| Selected `roleid` | `50441a2f-cd6d-f111-ab0d-00224818ead9` |
| Basic User used | No |

The role was resolved from the user's direct role links and matched to the user's business unit. No team role or Basic User role was added to the form access configuration.

## Access Configuration

| Form | Before | After unpublished PATCH | Published after failed PublishXml |
|---|---|---|---|
| Full Replica `97a1555b-0903-408a-ac63-d63aed65b14a` | Everyone, Fallback=true, Order=2 | Specific role `50441a2f-cd6d-f111-ab0e-00224818ead9`, Everyone=false, Fallback=false, Order=2 | Still Everyone, Fallback=true, Order=2 |

The unpublished read-back confirmed the requested role-only condition. The published read-back still showed the previous condition because Dataverse rejected the publish request before publication.

Full Replica remained Active and Non-default in both definitions. No form order, default form, fallback form, Sales Trial, Protected Form, App, BPF, Plugin, or business data was changed by this phase.

## Runtime Read-Back

After the PATCH and failed publish, a read-only `RetrieveFilteredForms` query for the test user returned Full Replica as the first available form:

1. Full Replica `97a1555b-0903-408a-ac63-d63aed65b14a`
2. Protected Form `8db60b46-b976-f111-ab0e-00224817cb31`
3. Standard Opportunity form
4. Sales Insights
5. Sales Trial
6. Lead qualification opportunity form

This is evidence that the effective access registry recognized the unpublished role assignment. It is **not** a published runtime result. New/Open, direct `formid`, and selector browser checks were deliberately not run after the 429 stop.

## Protection Checks

| Protected item | Result |
|---|---|
| Protected Form XML hash | Unchanged: `5519ce235d63873d934fc5dbd4b9fdb703e9a62e692d2c38e03396f7688030b7` |
| Protected Form JSON hash | Unchanged: `94de2fe47db7300420c7fcf73c6c1ff24d830aefea9f4a1a765daf4cd728b8f9` |
| Sales Trial XML/JSON | Unchanged; non-default and active |
| Modern App | Unchanged; descriptor hash `72c27875386e4865aa06105720e7ddff788eff8ec06f0576dce926ab30d7a424` |
| Business Rule | Draft/Inactive |
| Custom BPF | Draft/Inactive, category 4, primary entity `opportunity` |
| Plugin | 1 Assembly, 3 Types, 7 Steps, 6 Images; Enabled 7 / Disabled 0 |

## Publish Failure And Next Gate

The targeted request was:

```text
POST /api/data/v9.2/PublishXml
ParameterXml=<importexportxml><entities><entity>opportunity</entity></entities></importexportxml>
```

Dataverse returned HTTP 429:

```text
Cannot start the requested operation [Publish] because there is another [Uninstall] running at this moment.
```

No retry, broad publish, activation, default-form change, Basic User assignment, or browser save was performed. The next safe step is a new read-only environment publish-lock check. Only after the lock is absent should a separately authorized single Opportunity `PublishXml` be attempted, followed by `RetrieveFilteredForms` and browser New/Open verification.

## Request Accounting

| Operation | Count |
|---|---:|
| GET | 24 |
| PATCH | 1, Full Replica `formxml` only |
| POST | 1, targeted `PublishXml` attempt; HTTP 429 |
| DELETE | 0 |
| Publish actions | 1 attempted, 0 completed |
| Activation actions | 0 |
| Business data writes | 0 |
| Production requests | 0 |

## Gate

`Runtime Form Access Repair Ready=false`

Blocking reason: Opportunity publication was rejected by a concurrent Solution Uninstall. Do not enter the browser runtime validation gate until a read-only check confirms the publish lock is gone and a separately authorized targeted publish succeeds.

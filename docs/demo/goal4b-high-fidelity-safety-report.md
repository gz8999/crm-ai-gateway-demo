# Goal 4B High Fidelity Safety Report

High fidelity uses the server-side identity-redacted context only after explicit user confirmation. It may include identity-redacted business and Timeline text, exact dates, exact amounts, routes and commercial terms for the approved external demo profile.

The context builder blocks customer/company/contact identity, email, phone, address, GUID, CRM IDs, customer numbers, credentials and unredacted identity values. The standard safe-context flags remain false for raw CRM, raw Timeline and exact amounts sent to the external model.

The new Flash samples (`DEMO-OPP-010`, `DEMO-OPP-030`, `DEMO-OPP-003`, and the latest explicit verification of `DEMO-OPP-075`) returned HTTP 200 with one function tool call, but their string arguments failed one-shot JSON parsing (`argument_json_invalid`). No tolerant repair or second parse was used, and no raw provider body is exposed by the public audit. The five-sample gate therefore remains closed.

The offline response path now reuses the shared strict single-parse parser and records only safe parse diagnostics. This is not counted as Provider compatibility proof until a separately authorized external probe validates it.

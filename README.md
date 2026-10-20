# Blueworks Live MCP Servers

Two local [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers that let an AI assistant read and edit IBM Blueworks Live (BWL) through its REST API.

| Server | Directory | Purpose | Tools |
|---|---|---|---|
| **Reporting** | [`bwl-reporting-mcp-server/`](bwl-reporting-mcp-server) | Read blueprints, spaces, glossary and account activity. Also has some write tools (import, export, activity edits). | 18 |
| **Authoring** | [`bwl-authoring-mcp-server/`](bwl-authoring-mcp-server) | Edit and manage artifacts: activity details, spaces and permissions, glossary, policies, comments, files, revisions. | 21 |

Both servers talk to BWL over HTTPS using an OAuth 2.0 client-credentials Service ID, and communicate with the MCP client over **stdio**.

- [1. Quick start](#1-quick-start)
- [2. Configuration](#2-configuration)
- [3. Authentication](#3-authentication)
- [4. Reporting server tools](#4-reporting-server-tools)
- [5. Authoring server tools](#5-authoring-server-tools)
- [6. Which server for which task](#6-which-server-for-which-task)
- [7. Worked example: set a custom property on an activity](#7-worked-example-set-a-custom-property-on-an-activity)
- [8. Rate limits](#8-rate-limits)
- [9. Troubleshooting](#9-troubleshooting)
- [10. Known limitations](#10-known-limitations)
- [11. Development](#11-development)
- [12. Security](#12-security)

---

## 1. Quick start

Requirements: Node.js 20 or later (the servers use the built-in `fetch`, `FormData` and `AbortSignal.timeout`).

```bash
# Reporting server
cd bwl-reporting-mcp-server
npm install
npm run build

# Authoring server
cd ../bwl-authoring-mcp-server
npm install
npm run build
```

Each build writes `build/index.js`, the entry point the MCP client launches. Then register both servers in [`.bob/mcp.json`](.bob/mcp.json) (see [Configuration](#2-configuration)) and reload MCP servers in your client.

---

## 2. Configuration

Servers are launched by the MCP client with environment variables from `.bob/mcp.json`. Example (values are placeholders):

```json
{
  "mcpServers": {
    "bwl-reporting-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/bwl-reporting-mcp-server/build/index.js"],
      "env": {
        "BWL_SERVER": "https://<your-region>.blueworkslive.com",
        "BWL_CLIENT_ID": "<client id>",
        "BWL_CLIENT_SECRET": "<client secret>"
      },
      "alwaysAllow": ["bwl_get_blueprint", "bwl_get_process_data"],
      "disabled": false
    },
    "bwl-authoring-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/bwl-authoring-mcp-server/build/index.js"],
      "env": {
        "BWL_SERVER": "https://<your-region>.blueworkslive.com",
        "BWL_ON_BEHALF_OF": "<bwl username or email>",
        "BWL_CLIENT_ID": "<client id>",
        "BWL_CLIENT_SECRET": "<client secret>"
      },
      "disabled": false
    }
  }
}
```

### Environment variables

| Variable | Server | Required | Description |
|---|---|---|---|
| `BWL_SERVER` | both | yes | Base URL of your BWL account, for example `https://mel001.blueworkslive.com`. The authoring server rejects anything that is not `https://`. |
| `BWL_CLIENT_ID` | both | yes | Client ID from the Service ID credentials JSON. |
| `BWL_CLIENT_SECRET` | both | yes | Client secret from the credentials JSON. |
| `BWL_CONSENT_TYPE` | both | no | Set to `user_consent` only for a genuine *User* Service ID. Sent as `consent_type` in the token request. Omit it otherwise. |
| `BWL_ON_BEHALF_OF` | authoring | no | BWL username sent as the `X-On-Behalf-Of` header on every request. Needed when the credential behaves as a plain Service ID (see [Authentication](#3-authentication)). |

If a required variable is missing, the server prints the missing names to stderr and exits at startup.

### Credentials

Credentials are downloaded from BWL as JSON files (`*_SVC_ID.json`). **Do not commit them and do not paste them into chat.** Copy the values into the `env` block of `.bob/mcp.json`. See [Security](#12-security).

---

## 3. Authentication

Both servers use the OAuth 2.0 **client credentials** grant:

1. `POST {BWL_SERVER}/oauth/token` with `grant_type=client_credentials`, `client_id`, `client_secret`, and `consent_type` if `BWL_CONSENT_TYPE` is set.
2. The access token is cached in memory and refreshed 60 seconds before expiry.
3. Every API call sends `Authorization: Bearer <token>`.
4. On HTTP **401**, the cached token is discarded, a new one is fetched and the request is retried once.
5. On HTTP **429**, the server waits for `Retry-After` seconds (the authoring server caps the wait at 120 s) and retries once.

### Service ID types

| Type | Created by | `X-On-Behalf-Of` needed? | `consent_type=user_consent` needed? |
|---|---|---|---|
| Service ID | Account admin | Yes, for calls that need a user context | No |
| User Service ID | Individual user | No | Yes |

> **This account:** the credentials are filed as User Service IDs, but BWL treats them as plain Service IDs. Token requests with `consent_type=user_consent` fail with HTTP 400, and edit calls need `X-On-Behalf-Of` or fail with HTTP 400 "can only be called with a user context". The configuration above therefore leaves `BWL_CONSENT_TYPE` unset and sets `BWL_ON_BEHALF_OF` on the authoring server. If an admin later enables User Service ID API access, revisit this.

### Service ID categories

A Service ID can only call APIs in the categories assigned to it. The reporting server needs an **Artifact Reporting** category, and the authoring server needs **Artifact Authoring**. A call outside the assigned category returns HTTP 403.

### One token per Service ID

Requesting a new token for a Service ID invalidates the previous one. If you request tokens outside the servers (for example with `curl`) using the same credentials, a running server's cached token stops working. The 401 retry recovers from this automatically on the next call.

---

## 4. Reporting server tools

Server name: `bwl-reporting-mcp-server`. Source: [`bwl-reporting-mcp-server/src/`](bwl-reporting-mcp-server/src).

Every tool accepts an optional `on_behalf_of` parameter (BWL username) that is sent as `X-On-Behalf-Of`. Responses are pretty-printed JSON. Failures return `isError: true` with the HTTP status and body.

### Spaces

| Tool | Parameters | Description |
|---|---|---|
| `bwl_list_spaces` | `name` | Find spaces by name. **The API requires a name filter; it cannot list all spaces.** `name=*` returns an empty list. |
| `bwl_get_space` | `space_id`, `include_subspaces` | Get one space by ID. `include_subspaces` is valid only here. |
| `bwl_create_space` | `name`, `parent_space_id` | Create a space (500/hour). |

### Blueprints

| Tool | Parameters | Description |
|---|---|---|
| `bwl_list_blueprints` | `name` **or** `tag`, `space_id`, `space_name`, `archived_state` (`active`, `archived`, `all`) | List blueprints. Use exactly one of `name` or `tag`. |
| `bwl_get_blueprint` | `blueprint_id`, `revision_id` | Full blueprint details: milestones, activities, built-in and custom properties (with glossary names), tags, spaces, audit fields. |
| `bwl_get_process_data` | `process_id` | Raw item map for a process (`/scr/api/ProcessData`). Custom properties appear as `customTextN` / `customNumberN` keys, and glossary values as items of type `CUSTOM_TEXT_N`. Value Add is a code (`1` or `2`). |
| `bwl_import_blueprint` | `file_path`, `space_id`, `name` | Import a `.bpmn`, `.xml` or `.zip` file as a new blueprint (200/hour). |
| `bwl_export_blueprint` | `process_id`, `revision_id`, `output_path`, `export_to_single_file`, `include_diagram_interchange` | Export a blueprint as a BPMN zip to a local path. |
| `bwl_get_blueprint_usage` | `blueprint_id` | Where a blueprint is used across the account. |
| `bwl_search` | `search_field_name`, `search_field_value`, `return_fields` | Search processes, policies and decisions. **Currently fails** with "version parameter required" (see [Known limitations](#10-known-limitations)). |

### Activities

| Tool | Parameters | Description |
|---|---|---|
| `bwl_update_activity` | `blueprint_id`, `activity_id`, `updates` | Update activity details (`PUT .../activities/{id}/details`). Same payload as the authoring server's `bwl_update_activity_details`. |
| `bwl_set_activity_documentation` | `blueprint_id`, `activity_id`, `documentation` | Set activity documentation. See [Known limitations](#10-known-limitations). |

### Glossary

| Tool | Parameters | Description |
|---|---|---|
| `bwl_list_glossary_categories` | `show_all` | List glossary categories, including custom property categories. |
| `bwl_list_glossary_values` | `category` | List values of one category. |
| `bwl_upsert_glossary_values` | `category`, `values[{name, id}]` | Add or update values (30/hour). See [Known limitations](#10-known-limitations). Prefer the authoring server's version. |
| `bwl_get_glossary_value_usage` | `value_id` | Where a glossary value is used. |

### Account activity

| Tool | Parameters | Description |
|---|---|---|
| `bwl_list_activities` | none | Account activity events from the filter-based API (200/hour). |
| `bwl_get_activity_legacy` | `start_date`, `end_date`, `types[]` | Legacy activity log. Maximum range 31 days. Example types: `LOGINS`, `PROCESSES_VIEWED`. |

Both activity tools require an admin credential.

---

## 5. Authoring server tools

Server name: `bwl-authoring-mcp-server`. Source: [`bwl-authoring-mcp-server/src/`](bwl-authoring-mcp-server/src).

Success responses are pretty-printed JSON when the body is JSON. Many Authoring endpoints return a plain-text message instead (for example `Updated Process Details.`), which is passed through as is, and an empty body is reported as `OK (HTTP <status>)`. Errors return `isError: true` with `BWL API error <status> on <method> <path>: <body>` (body truncated to 2000 characters).

### Artifacts

Artifacts are processes, decisions, policies and spaces. All of these use `/bwl/artifacts/{id}`.

| Tool | Parameters | Description |
|---|---|---|
| `bwl_move_artifact` | `artifact_id`, `parent_space_id` | Move to another space. `parent_space_id` is required for non-space artifacts. Omit it to move a space to the top level. |
| `bwl_rename_artifact` | `artifact_id`, `name` | Rename. |
| `bwl_archive_artifact` | `artifact_id` | Archive. Archived artifacts can later be deleted by an admin. |
| `bwl_publish_artifact` | `artifact_id`, `revision_id` | Publish a process or decision, optionally a specific revision. |
| `bwl_unpublish_artifact` | `artifact_id` | Unpublish. |
| `bwl_copy_artifact` | `artifact_id`, `parent_space_id`, `name` | Copy, optionally into another space and/or with a new name. Returns `new-artifact-id`. Space copies: 10/hour; others: 100/hour. |
| `bwl_delete_artifact` | `artifact_id`, `force` | **Destructive.** Permanently deletes an **archived** artifact (admin only). A 409 response lists usages, and `force=true` deletes anyway. |

### Spaces

| Tool | Parameters | Description |
|---|---|---|
| `bwl_create_space` | `name`, `parent_space_id` | Create a space (500/hour). Omit the parent for a top-level space. |
| `bwl_update_space_permissions` | `space_id`, `operation` (`add`, `update`, `delete`), `inherit_parent_space`, `users[]` | Each user entry needs `participantId` or `participantType` (`all-editors`, `all-contributors`, `all-community`, `all-viewers`, `all-admins`) and optional `permissions` (`blueprintProcesses`, `automateProcesses`, `composeDecisions`, `authorPolicies`, `manageAndEdit`). For a sub-space that inherits permissions, first call with `operation=update` and `inherit_parent_space=false`. |

### Glossary

| Tool | Parameters | Description |
|---|---|---|
| `bwl_upsert_glossary_values` | `category`, `values[]` | Create or update values (30/hour, glossary manager role). Supply `id` to update, or `name` to create/match. Categories: `participant-businessowner-expert`, `externalparticipant`, `system`, `supplier-customer`, `input-output`, `problem`, `kpi`, `businessunit`, or a custom property name. `tag` and `goal` are unsupported. Sends the values as the bare JSON array the API expects. |
| `bwl_delete_glossary_value` | `value_id`, `force` | **Destructive.** Requires glossary manager and admin. Returns 409 if the value is in use unless `force=true`. |

### Blueprints, activities, policies, comments, files

| Tool | Parameters | Description |
|---|---|---|
| `bwl_update_activity_details` | `blueprint_id`, `activity_id`, `details` | Update an activity (200/hour). `details` is a JSON object, see [activity detail fields](#activity-detail-fields). |
| `bwl_set_activity_documentation` | `blueprint_id`, `activity_id`, `documentation` | Set documentation (HTML or plain text). |
| `bwl_import_blueprint` | `file_path`, `space_id`, `name` | Import `.bpmn`, `.xml` or `.zip` as a new blueprint. |
| `bwl_create_policy` | `policy_name`, `space_id` | Create a policy. Returns `id` and `name`. |
| `bwl_update_policy` | `policy_id`, `description`, `hyperlink_references[{name, url}]` | Update a policy. |
| `bwl_post_comment` | `process_id`, `activity_id`, `comment`, `parent_comment_id` | Comment on a process or activity, or reply to a comment. Returns `commentId`. |
| `bwl_upload_file` | `file_path`, `location`, `ancestor_id`, `parent_id` | Attach a local file (max 50 MB). `location` is one of `activity`, `app`, `decision`, `instance`, `policy`, `post`. For an activity, `ancestor_id` is the blueprint ID and `parent_id` is the process ID. |

### Revisions and favorites

| Tool | Parameters | Description |
|---|---|---|
| `bwl_list_revisions` | `artifact_type` (`process`, `policy`, `decision`), `artifact_id`, `show_all`, `show_published_snapshots` | List snapshots. **Returns 403 unless the credential is an Artifact Reporting Service ID**, because the revisions endpoint belongs to the reporting category. |
| `bwl_create_revision` | `artifact_type`, `artifact_id`, `label` | Create a snapshot. Returns `id`, `label`, `time`. |
| `bwl_update_favorites` | `favorite_ids[]` | Replace the user's favorites using process app IDs. |

### Activity detail fields

`details` for `bwl_update_activity_details` (and `updates` for the reporting server's `bwl_update_activity`) accepts the following. Look up glossary IDs first with the reporting server.

| Field | Value |
|---|---|
| `name` | string |
| `participants` | a single glossary ID |
| `businessOwners`, `experts`, `systems`, `suppliers`, `customers`, `inputs`, `outputs` | arrays of glossary IDs |
| `cost` | number |
| `risk` | `Controlled`, `Low`, `Medium` or `High` |
| `valueAdd` | `Yes`, `No` or `Required` |
| `cycleTime` | `{ "workTime": "10m", "waitTime": "0m" }`. Units: `m`, `h`, `d`, `w`, `M`. |
| `dueDateType`, `dueDateDuration` | `set duration` or `no due date`, plus a duration |
| `problems` | `[{ "problem", "severity", "frequency" }]` |
| `activityPolicies`, `decisions` | as defined by the BWL API |
| custom text property | key is the property name, value is an array of glossary IDs, for example `{"Process Owner": ["20725d419de"]}` |
| custom number property | key is the property name, value is a number |

BWL allows up to 20 text and 10 number custom properties per account. Text properties are glossary-backed, so a value must exist in the glossary before it can be assigned.

---

## 6. Which server for which task

| Task | Use |
|---|---|
| Read a blueprint, steps and property values | Reporting: `bwl_get_blueprint`, `bwl_get_process_data` |
| Find a blueprint or space | Reporting: `bwl_list_blueprints`, `bwl_list_spaces` |
| Look up a glossary value ID | Reporting: `bwl_list_glossary_values` |
| Export a blueprint to BPMN | Reporting: `bwl_export_blueprint` |
| Change an activity | Authoring: `bwl_update_activity_details` |
| Create glossary values | Authoring: `bwl_upsert_glossary_values` |
| Move, rename, copy, archive, publish | Authoring |
| Space permissions, policies, comments, attachments | Authoring |
| Account activity log | Reporting |
| Snapshots | Authoring `bwl_create_revision`. `bwl_list_revisions` needs a reporting credential (see above). |

Tools with the same name exist on both servers (`bwl_create_space`, `bwl_import_blueprint`, `bwl_upsert_glossary_values`, `bwl_set_activity_documentation`). When both servers are enabled, an MCP client may list both. Prefer the authoring server's version for writes.

---

## 7. Worked example: set a custom property on an activity

Goal: set **Process Owner** to `RAM` on **Step A** of the *SIPOC Process* blueprint.

1. **Find the blueprint and activity IDs** (reporting):
   `bwl_list_blueprints` with `name: "SIPOC Process"` gives the blueprint ID `20425d4473d`. `bwl_get_blueprint` lists activities, and Step A is `20425d4474a`.
2. **Find the glossary value** (reporting):
   `bwl_list_glossary_values` with `category: "Process Owner"` shows `RAM` as `20725d419de`. If it is missing, create it with `bwl_upsert_glossary_values` (authoring) and `values: [{ "name": "RAM" }]`.
3. **Update the activity** (authoring):
   `bwl_update_activity_details` with
   ```json
   {
     "blueprint_id": "20425d4473d",
     "activity_id": "20425d4474a",
     "details": { "Process Owner": ["20725d419de"] }
   }
   ```
   Response: `Updated Process Details.`
4. **Verify** (reporting):
   `bwl_get_blueprint` now shows `"Process Owner": [{ "id": "20725d419de", "name": "RAM" }]` on Step A. `bwl_get_process_data` shows the same value as `customText1`.

---

## 8. Rate limits

Limits are account-wide. Exceeding one returns HTTP 429 with a `Retry-After` header, and both servers wait and retry once.

| Operation | Limit |
|---|---|
| `PUT /bwl/glossary-values/{category}` | 30/hour |
| Most authoring endpoints, including activity details update | 200/hour |
| Blueprint import | 200/hour |
| `GET /bwl/activities` | 200/hour |
| `GET /bwl/blueprints/{id}` | 200/minute per user |
| Space create | 500/hour |
| Artifact copy | 100/hour (spaces: 10/hour) |
| Legacy `/scr/api/activity` | not rate limited |

See [`Blueworks_Live_API_Knowledge_Base.md`](Blueworks_Live_API_Knowledge_Base.md) for the full table.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Server exits with `Missing required environment variables` | `BWL_SERVER`, `BWL_CLIENT_ID` or `BWL_CLIENT_SECRET` not set in `.bob/mcp.json` | Add them and reload MCP servers. |
| `Token request failed … 400` (reporting server prints the body: "Could not retrieve the account information for the client_id") | `BWL_CONSENT_TYPE=user_consent` set with a credential that BWL treats as a plain Service ID | Unset `BWL_CONSENT_TYPE`. |
| `400 … can only be called with a user context` | Edit call without `X-On-Behalf-Of` | Set `BWL_ON_BEHALF_OF` (authoring) or pass `on_behalf_of` (reporting). |
| `400` on a call that previously worked, after adding `X-On-Behalf-Of` | The endpoint does not support user context | Remove the header for that call. |
| `401` that persists | Credentials revoked or wrong server URL | Check the Service ID in BWL admin and `BWL_SERVER`. A single 401 is retried automatically. |
| `403` | Credential lacks the API category, API access is disabled in BWL admin, or (User Service ID) the user cannot access the resource | Check the Service ID's categories and the admin API settings. `bwl_list_revisions` always needs a reporting credential. |
| `400` from `bwl_list_spaces` | Unsupported query parameter | Pass only `name`. |
| `bwl_list_blueprints` returns an error | Both or neither of `name` and `tag` | Use exactly one. |
| `BWL_SERVER must be an https:// URL` | Authoring server enforces HTTPS | Use the `https://` URL. |
| `429` | Rate limit | The server waits and retries once. Reduce call volume if it repeats. |
| Tool blocked after repeated failures with the same arguments | MCP client safety limit | Change the arguments or fix the cause first. |
| Changes to source have no effect | `build/` is stale | Run `npm run build` in that server and reload MCP servers. |
| A running server suddenly returns 401 | Another process requested a token for the same Service ID | The next call refreshes the token. Avoid fetching tokens separately with the same credentials. |

Diagnostics go to **stderr** with the prefixes `[bwl-mcp]` (reporting) and `[bwl-authoring]` (authoring). Stdout is reserved for the MCP protocol, so never log to it.

---

## 10. Known limitations

- **`bwl_list_revisions` returns 403** on the authoring server. The revisions endpoint is in the reporting category, so it needs an Artifact Reporting Service ID. No code change fixes this, and it is intentionally left as is.
- **Cannot list all spaces.** `GET /bwl/spaces` requires a `name` or `tag` filter.
- **`bwl_search` (reporting) fails** with "version parameter required". The tool sends `version` in the JSON body. The API most likely expects it as a query parameter, as other `/scr/api/` calls do, but this has not been verified or fixed. Use `bwl_list_blueprints` for name or tag lookups.
- **Reporting `bwl_upsert_glossary_values` sends `{ "values": [...] }`**, while the API expects a bare JSON array (the direct call that worked used `[{"name":"RAM"}]`). Use the authoring server's tool, which sends the array.
- **Documentation payload differs between servers.** The authoring `bwl_set_activity_documentation` sends `{ "description": ... }`, and the reporting one sends `{ "documentation": ... }`. Neither has been tested here, and the API's expected field has not been confirmed, so check the result after using either.
- **Value Add codes.** `bwl_get_process_data` returns raw codes (`1`, `2`). `bwl_get_blueprint` returns `yes` or `no`.
- **Reporting server does not enforce HTTPS** on `BWL_SERVER`, and it includes the token endpoint's error body in its error text. The authoring server enforces HTTPS and does not echo that body.
- **Duplicated tool names** across the two servers (see [section 6](#6-which-server-for-which-task)).

---

## 11. Development

```
bwl-reporting-mcp-server/
  src/index.ts          server entry, env validation, stdio transport
  src/auth.ts           token cache, bwlFetch (401/429 retry), bwlJson
  src/tools/            spaces.ts, blueprints.ts, glossary.ts, reporting.ts
  build/                compiled output (generated)

bwl-authoring-mcp-server/
  src/index.ts          server entry, env validation, stdio transport
  src/auth.ts           token cache, bwlRequest (timeout, 401/429 retry, X-On-Behalf-Of)
  src/util.ts           run(): request -> MCP tool result
  src/tools/            artifacts.ts, spaces.ts, glossary.ts, blueprints.ts, revisions.ts
  build/                compiled output (generated)
```

| | Reporting | Authoring |
|---|---|---|
| MCP SDK | `@modelcontextprotocol/sdk` | `@modelcontextprotocol/server` |
| Schema library | `zod` 3 | `zod` 4 (`zod/v4`) |
| TypeScript | 5.x | 7.x |
| Request timeout | none | 60 s |

Build with `npm run build` (runs `tsc` and marks `build/index.js` executable).

### Adding a tool

1. Add a `server.registerTool("bwl_<name>", { description, inputSchema }, handler)` call in the relevant `src/tools/*.ts` file.
2. Authoring server: return `run({ method, path, query, json })`. It handles errors and response shaping.
3. Reporting server: call `bwlJson` or `bwlFetch` and wrap the result in a text content block, with `isError: true` on failure.
4. Run `npm run build`, add the tool name to `alwaysAllow` in `.bob/mcp.json` if you want it to run without a prompt, and reload MCP servers.

### Reference material

- [`Blueworks_Live_API_Knowledge_Base.md`](Blueworks_Live_API_Knowledge_Base.md): condensed API reference (authentication, endpoints, limits, custom properties, BPMN mapping).
- [`blueworks-live-documentation.pdf`](blueworks-live-documentation.pdf): the full BWL documentation.

---

## 12. Security

- **Never commit credentials.** In a working copy, `.bob/mcp.json` and the `*_SVC_ID.json` files contain client secrets. The `.bob/mcp.json` in this repository is a template with placeholder values. Put real values only in your local copy and do not commit them. The root `.gitignore` excludes `*SVC_ID.json`, `.env`, `node_modules/` and `build/`. Rotate any secret that has been exposed.
- Secrets live only in the `env` block of the MCP client config, never in source code.
- The authoring server never logs response bodies from the token endpoint. Do not paste tokens or secrets into chat or issues.
- Use the minimum Service ID categories needed. A read-only workflow only needs Artifact Reporting.
- `alwaysAllow` skips the approval prompt. The current `.bob/mcp.json` lists `bwl_delete_artifact` and `bwl_delete_glossary_value` there, so those destructive tools run without confirmation. Remove them from `alwaysAllow` if you want a prompt.
- Deleting an artifact requires it to be archived first, and a 409 response lists its usages before anything is removed. Review usages before using `force=true`.
- `BWL_ON_BEHALF_OF` makes writes appear as that user in BWL's audit trail.

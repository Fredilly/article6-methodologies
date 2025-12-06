# Tool Metadata & OpenAPI Checklist

This checklist defines the canonical rules for every tool that ships in this
repository. A “tool” lives under `tools/<Publisher>/<Program>/<Code>/vXX-X/`
and must contain:

1. A structured `meta.json` manifest.
2. An OpenAPI document (`openapi.yml`, `openapi.yaml`, or `openapi.json`).

CI and the quality gates use this checklist to keep tool metadata deterministic,
machine-readable, and aligned with the methodologies that reference them.

---

## Tool META (`meta.json`)

### 1. File basics

- Valid JSON encoded as UTF-8 with LF line endings.
- Stored next to the tool artefacts (e.g. `tools/UNFCCC/Agriculture/AM-TOOL01/v01-0/meta.json`).
- No additional files or sibling manifests.

### 2. Required top-level fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier such as `UNFCCC.Agriculture.AM-TOOL01@v01-0`. |
| `title` | Human-readable name (≤120 characters). |
| `description` | One or two sentences describing the tool; no markdown or TODOs. |
| `methodology_ids` | Array of methodology IDs that consume the tool. |
| `domain` | String describing the program and scope (e.g. `UNFCCC Agriculture`). |
| `maintainer` | Object with `name` and `email` (valid email address). |
| `source` | Object with `type` (publisher) and `url` (official landing page). |
| `repo` | Object with `url`, `path`, and pinned `commit` SHA-1. |
| `openapi` | Object with `path` (relative repo path) and OpenAPI `version` string. |
| `auth` | Object describing authentication. `type` is required (e.g. `none`, `apiKey`, `service_http`). Include supporting fields such as `authorization_type`, `header`, or `scopes` when relevant. |
| `operations` | Array of operation descriptors (see below). |

### 3. Operations block

Each entry in `operations[]` must include:

- `id`: Short snake_case identifier unique within the tool.
- `method`: HTTP method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, or `HEAD`).
- `path`: Relative endpoint (must start with `/`).
- `summary`: One-sentence summary.
- `description`: One-sentence detail (no TODOs).
- `openapi_operation_id`: Must match the `operationId` in the OpenAPI spec.

### 4. Value constraints

- No required field may be `null`, an empty string, or a placeholder (`TODO`, `TBD`, `N/A`, `example.com`, etc.).
- Arrays must contain at least one item, and duplicate `id`/`openapi_operation_id` values are forbidden.
- URLs must be valid absolute URIs; emails must look like working inboxes.
- `repo.commit` must be a 7–40 character hexadecimal SHA.
- `openapi.path` must point to a file inside the repository and end with `.json`, `.yaml`, or `.yml`.

### 5. Additional-property guardrails

- `meta.json` must not contain undocumented keys at the top level.
- Nested objects (`maintainer`, `source`, `repo`, `openapi`, `auth`, `operations[]`) also disallow unknown keys.

---

## Tool OpenAPI (`openapi.yml` / `openapi.yaml` / `openapi.json`)

### 1. File basics

- Valid OpenAPI 3.x document.
- Located in the same directory as `meta.json`.
- The filename referenced by `meta.json.openapi.path` must exist.

### 2. Required structure

- `openapi`: string matching `3.x.y`.
- `info.title` and `info.version`: short descriptive strings.
- `paths`: at least one entry whose key starts with `/`.

### 3. Operation requirements

For every `operations[]` entry in `meta.json`:

- A matching `path` + HTTP method must exist in `paths`.
- The `operationId` must equal `openapi_operation_id`.
- Each operation MUST include:
  - `summary`
  - `description`
  - `responses` with an HTTP `200` entry that documents a schema.
  - (If the endpoint accepts input) `requestBody.content.application/json.schema`
    with `type: object`, declared `properties`, and a `required` array covering
    mandatory inputs. Each property must specify `type`, `description`, and
    optional constraints (`enum`, `minimum`, `maxLength`, etc.).
- Optional error responses (4xx/5xx) should at least include `description`.

### 4. Schema hygiene

- Parameter and response descriptions are single sentences—no markdown tables.
- Request/response schemas must set `additionalProperties: false` unless the API
  explicitly allows arbitrary keys.
- Enumerations should be used for finite sets of values.
- Numerical fields should specify realistic `minimum`/`maximum` bounds.

### 5. Authentication alignment

- If `meta.json.auth.type` is not `none`, the OpenAPI document must declare the
  matching `securitySchemes` entry and reference it on each secured operation.

---

## Common Rules

- **No placeholders:** Never use “TODO”, “TBD”, `example@example.com`, or dummy URLs.
- **Deterministic formatting:** Stable key ordering and LF line endings keep git
  diffs clean.
- **Keep files together:** Each tool directory owns its `meta.json`, OpenAPI
  file, PDFs, and any helper docs. Do not reference files outside the repo.
- **Checklist gating:** `ingest-quality-gates` enforces this checklist. Failing
  any rule blocks CI until corrected.

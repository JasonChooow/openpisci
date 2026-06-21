# XiaoNuo Cloud Marketplace API

Desktop client contract for the official cloud marketplace served at `{cloudBase}/api/marketplace/*`.

Default `cloudBase`: `https://www.dimnuo.com` (user-editable via `pisci-cloud-base-url` in localStorage).

## Endpoints

### `GET /api/marketplace/index`

Public browse index. No authentication required.

**Response** (`application/json`):

```json
{
  "experts": [
    {
      "id": "openpisci/expert/research-analyst@1.0.0",
      "name": "调研分析师",
      "description": "…",
      "tags": ["finance"]
    }
  ],
  "teams": [
    {
      "id": "openpisci/team/content-squad@1.0.0",
      "name": "内容小队",
      "description": "…",
      "tags": []
    }
  ],
  "skills": [
    {
      "id": "openpisci/skill/docx@1.0.0",
      "name": "docx",
      "description": "…",
      "tags": ["cb-teams"]
    }
  ],
  "connectors": [
    {
      "id": "official/connector/demo-sse-mcp@1.0.0",
      "name": "Demo SSE MCP",
      "description": "…",
      "platform_compat": { "surfaces": ["web", "desktop"] }
    }
  ]
}
```

**Query (recommended for desktop):** `?surface=desktop&os=linux&capabilities=mcp_stdio,com`

Legacy clients without `client_profile` receive the full unfiltered index (additive fields only).

Each summary may include **`platform_compat`**, **`requires_capabilities`**, **`compatible`**, **`incompatible_reason`** when filtering is active.

### `GET /api/marketplace/asset/{id}`

Returns the full asset document for the given catalog `id`.

| Asset kind | Response shape |
|------------|----------------|
| Expert | [`MarketExpertPackage`](../marketplace/schema/expert-pack.v1.schema.json) JSON |
| Team | [`MarketTeamPackage`](../marketplace/schema/team-template.v2.schema.json) JSON |
| Skill | [`skill-pack.v1`](../marketplace/schema/skill-pack.v1.schema.json) manifest **or** redirect to manifest URL |
| Connector | [`connector-pack.v1`](../../theAgentOS/marketplace/schema/connector-pack.v1.schema.json) — install via AgentZ desktop (`source=remote`) |

For skills, the desktop client also resolves `SKILL.md` from the manifest directory when installing via GitHub raw URLs. Cloud deployments should either:

- Serve manifest at asset URL with co-located `SKILL.md`, or
- Include a `download_url` in the cloud index pointing directly to manifest JSON.

## Client behavior

Implemented in:

- Rust: `src-tauri/src/commands/platform/marketplace.rs`
  - `fetch_marketplace_aggregated` merges GitHub catalog + cloud index (passes desktop `client_profile`)
  - Parses optional `connectors` bucket + `platform_compat` on summaries
  - Dedup key: `{source}:{id}` (cloud entries skipped if GitHub already has same id)
  - `install_market_skill` fetches manifest → `SKILL.md` → local install

- Frontend: Skills tab「小诺云市场」via `marketplaceApi.fetchAggregated(getCloudBaseUrl())`

## Deployment checklist

1. Mirror [`marketplace/index.json`](../../marketplace/index.json) to cloud storage or generate dynamically.
2. Host asset files (experts/, teams/, skills/) with stable URLs.
3. Expose `/api/marketplace/index` and `/api/marketplace/asset/{id}` on the same origin as `cloudBase`.
4. Verify with: `curl https://www.dimnuo.com/api/marketplace/index`

## Future (optional)

- `POST /api/marketplace/publish` — authenticated upload for curated submissions
- Version channels (`stable`, `beta`) on index entries
- Signed manifests for supply-chain verification

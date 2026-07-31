# Security policy

## Supported versions

cairn is pre-1.0. Only the latest minor on the `main` branch receives
security updates.

| Version | Supported |
|---|---|
| 0.2.x (latest `main`) | ✅ |
| anything else | ❌ |

## Reporting a vulnerability

**Do not open a public issue for security reports.**

Use GitHub's private vulnerability reporting:

→ [github.com/heznpc/cairn/security/advisories/new](https://github.com/heznpc/cairn/security/advisories/new)

Expected response time: within 7 days. Fixes ship as soon as the
maintainer can verify and patch.

## Threat model — what cairn does and does not handle

cairn is a deterministic SVG generator. It is **not** an agent: it does
not call any LLM internally, store user data, or open inbound network
sockets.

In scope:
- SVG output is escaped (`escapeXml` in `src/render.ts`) so address and
  landmark names cannot inject markup into the rendered file.
- By default, outbound calls go only to:
  - `nominatim.openstreetmap.org` (geocoding)
  - `overpass-api.de` (landmark and road lookup)
  - Both are accessed over HTTPS with a project User-Agent and the
    Nominatim 1 req/s policy is enforced client-side.
- Those endpoints are configurable, for self-hosted or mirrored deployments,
  via `--nominatim-url` / `--overpass-url` and `CAIRN_NOMINATIM_URL` /
  `CAIRN_OVERPASS_URL`. Only `http:` and `https:` are accepted. They are
  deliberately *not* MCP tool arguments: a host LLM choosing the URL would be
  an SSRF path, so the endpoint stays the operator's decision.
- Upstream responses are cached on local disk by default (raw bodies,
  unencrypted, under `~/.cache/cairn`, 7-day TTL). Disable with `--no-cache` or
  `CAIRN_CACHE_MODE=off`.
- No tokens, API keys, or credentials are read from the environment. The
  `CAIRN_*` variables configure endpoints, cache, and retry behavior only.

Out of scope:
- Trustworthiness of OpenStreetMap data itself. Names returned by OSM
  may be incorrect, vandalized, or stale; cairn does not validate
  them beyond ensuring they have a `name` tag.
- The host MCP client's behavior with cairn's output. The SVG should
  be safe to embed, but consumers that re-encode or post-process the
  SVG remain responsible for their own pipeline.

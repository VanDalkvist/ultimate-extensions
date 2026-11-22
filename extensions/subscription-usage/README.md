Subscription usage provides five user-global provider cards backed by native Pi authentication and a shared, normalized SQLite cache.

This directory is versioned source, deliberately outside Ultimate's autoload paths. Copy it to the user-global extension directory to enable it in every Ultimate using the same user home. No tools, prompts, provider overlays, credential-store readers, independent OAuth refresh logic, Claude Code integration or Wire hooks are included.

## User-global installation

After reviewing and landing the source, run from the stable repository checkout, not a disposable worktree:

```sh
source_dir="$PWD/.ultimate/user-extensions/subscription-usage"
target_dir="$HOME/.ultimate/extensions/subscription-usage"
install -d -m 700 "$target_dir" &&
  install -m 600 "$source_dir"/{types.ts,providers.ts,cache.ts,server.ts,web.solid.tsx,README.md} "$target_dir/" &&
  rm -f -- "$target_dir/web.tsx"
```

This copies a complete standalone extension; it does not symlink to a worktree or use relative imports into the clone. Ultimate discovers the user-global copy on its normal extension rescan/reload. Repeating the copy updates that installation. The final command removes only the old React facet, and only after the new files copy successfully; it leaves any other local files alone. No install command is run by the extension, and this source directory itself is not autoloaded. Installation enables authenticated usage requests on panel open, manual refresh, and relevant model answers. Removing the installed folder disables it; the non-secret SQLite cache is separate.

For previews, check `readlink -f` before copying: the instance tool shares user `extensions/` through a symlink to the real user directory. Copying into `<preview-home>/user/.ultimate/extensions/` installs globally, not into an isolated preview. Use a separate, link-free user home for an isolated installation.

## Backend contract

`types.ts` is browser-safe. Provider ids are `codex`, `claude`, `opencode`, `cursor`, `antigravity`. Actions return `UsageView`:

- `status(null)`: waits for this process's current refreshes, resolves current authentication identity through Pi, then reads cached usage only. It makes no usage HTTP requests; Pi's existing `getAuth` may perform its normal OAuth refresh.
- `refresh({provider?, force?})`: panel-open refresh; `force: true` is manual refresh. Normal TTL is five minutes; manual refresh has a 30-second floor. Neither overrides provider Retry-After.
- `pin({key, on})`: stores user-global pin overrides. Keys are `provider.window`; defaults are `codex.weekly`, `claude.session`, `claude.weekly`, `opencode.rolling`.

Successful model responses from `openai-codex`, `anthropic`, and `opencode-go` start tracked background refreshes without awaiting their network work. Release/close aborts and awaits local work; opening the existing facet resumes its response hook after a failed core swap returns to the old process. There is no polling or recurring timer.

## Sources and limits

- Codex: `https://chatgpt.com/backend-api/wham/usage`, native `openai-codex` OAuth only. Account id is taken from the access JWT's `https://api.openai.com/auth.chatgpt_account_id` claim, as Pi's Codex transport does. Missing percentage fields are omitted, never treated as 100% remaining.
- Claude: `https://api.anthropic.com/api/oauth/usage`, native `anthropic` OAuth only, with `oauth-2025-04-20`. Account-wide `five_hour`/`seven_day` and known legacy scoped windows are shown. Newer `limits[]` scopes are not included; these windows are not a claim of model-specific availability. Claude Code credentials are never used. If Pi's non-secret `listCredentials()` metadata lists only `anthropic-account-N` OAuth slots from `pi-multi-account`, the card explains that Ultimate needs its standard Anthropic login (⌘K → Log in → Anthropic). Slots are not registered, resolved, refreshed, copied or renamed by this extension; that requires separate multi-account support in Ultimate.
- OpenCode Go: `https://opencode.ai/zen/go/v1/usage`, runtime `opencode-go` API key only. `usage.rolling/weekly/monthly.percent` is already a percentage: `0.5` means 99.5% remaining, not 50%. This is not OpenCode Zen/BYOK usage. [Official pinned response implementation](https://github.com/anomalyco/opencode/blob/810c0eba1a7348036f8bdf61e6632d0c36c6876c/packages/console/app/src/routes/zen/go/v1/usage.ts).
- Cursor and Antigravity make **no requests**, regardless of authentication. They return no-data explanations and links to [Cursor terms](https://cursor.com/terms-of-service) and [Antigravity terms](https://antigravity.google/terms).

[Paseo 0.8's public quota fetchers](https://github.com/getpaseo/paseo/tree/v0.8.0/packages/server/src/services/quota-fetcher), Apache-2.0, were endpoint/response-shape research references. This is a minimal independent implementation, not a port of its credential discovery or fetcher framework. Test fixtures are representative public response shapes with synthetic values, not live account captures.

Every provider request uses a fixed HTTPS URL, rejects redirects, and has a 10-second abort timeout. Public runtime provider/model base URLs and the resolved auth base URL, when present, must have that provider's official origin; a custom/proxy origin is rejected before sending its key anywhere. Only `modelRuntime.getAuth` obtains request authentication. Raw responses, request authentication, transport errors and provider error bodies are not returned or logged.

## Shared cache

When installed and invoked, the backend uses `<host.userHome>/.ultimate/subscription-usage.sqlite` (normally `~/.ultimate/subscription-usage.sqlite`), mode `0600`, using Node's built-in SQLite. It stores normalized windows, timestamps, sanitized reasons, pin overrides, leases and provider-prefixed SHA-256 identity keys, never tokens or raw responses. SQLite atomically arbitrates refresh leases across processes without polling. Crashed leases expire after 30 seconds. Retry-After is honored up to 24 hours; errors otherwise defer requests for at least 30 seconds. A failed refresh retains prior successful windows visibly as `state: 'error'` with the original `fetchedAt`.

Codex keys use the account id; opaque Anthropic tokens and OpenCode Go API keys use a hash of request authentication, so token rotation may safely discard a cache hit. Accounts do not share snapshots. Missing/unsupported auth returns unavailable without selecting a cached snapshot.

The runtime's cached auth-status API exposes no account identity. Therefore every status read rechecks the identity with the existing `getAuth` resolver before selecting a shared snapshot. An unseen account returns no data rather than another account's percentages. This intentionally permits Pi-managed auth refresh on status, instead of incorrectly trusting a local account selection. Concurrent account changes during an already-running resolver/request are subject to the runtime's own auth-operation ordering.

## Verification

From the repository root on Node 26:

```sh
node --test .ultimate/user-extensions/subscription-usage/test/*.test.ts
pnpm test test/web/subscription-usage.test.solid.tsx
node scripts/check-extension.ts .ultimate/user-extensions/subscription-usage
pnpm check
```

`test/providers.test.ts` fixtures use the Codex/Claude response keys documented by the linked Paseo v0.8.0 `providers/codex.ts` and `providers/claude.ts`, and the Go shape from the pinned official route above. Values are synthetic, including Go's `0.5` percent regression case. `test/cache.test.ts` exercises shared handles, account separation, leases, TTL, manual throttling and backoff. `test/server.test.ts` checks in-flight completion, status-to-status account changes, fresh-reader cache visibility, auth error redaction, path placement and action validation. `test/lifecycle.test.ts` drives the registered response hook through release and reopen without reinstalling the facet.

Tests use temporary databases and fake runtime/fetch implementations. They never read credentials, install the extension, contact providers or spawn processes.

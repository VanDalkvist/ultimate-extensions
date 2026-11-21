# VPN five-finding remediation

## Design / scope
Explicit operator request: fix the five publication findings. Use the existing native Solid UI and controller API. Preserve live Mihomo configuration/mode/selection and BB; do not create a kill switch, routing probe or automatic daemon lifecycle manager. No history rewrite: already-public historical screenshots cannot be recalled by deleting HEAD.

Implementation calls: MIT for the separately owned controller wrapper (matching the collection, not relicensing the upstream Mihomo binary); truthful mode-only UI with a permanent no-protection-guarantee notice; cross-platform shell-free openers, configurable absolute config path and explicit safe Dashboard URL; preflight host typecheck; opt-in atomic replacement of a verified legacy symlink.

## Plan
- [ ] License the daemon under MIT, set package license metadata and update the pinned dependency.
- [ ] RED/GREEN mode presentation and UI-copy regressions: rule/direct/global labels never assert network protection. Keep the warning visible and control commands unchanged.
- [ ] RED/GREEN platform settings: macOS/Intel/Linux/Windows config paths; trusted .env overrides; shell-free native editor commands and safe URL validation. Keep file contents/secrets out of DTOs. Disable misleading loopback Dashboard navigation for remote browsers unless an explicit secure browser URL is configured.
- [ ] RED/GREEN installer preflight and conditional symlink migration. Reject incompatible/missing host SDK, foreign destinations and changed links; preserve legacy installation when readiness/preflight fails.
- [ ] Remove only docs/usage.png and its capture code; ignore that exact file so it cannot silently return. Preserve other contributors' screenshots/extensions.
- [ ] Run VPN/daemon suites, current-host typecheck, author architecture review and actual UI checks. Migrate the real symlink only from its verified old target after read-only readiness; refresh only the VPN extension if needed. Verify live state preservation.
- [ ] Commit/push main plus annotated checkpoints; record receipts and update finding statuses without inventing independent acceptance.

## Acceptance
Tests cover exact command vectors for simulated platforms; only the current macOS host receives native/live verification. Unsupported older SDKs fail explicitly rather than being claimed compatible. Cross-host Dashboard access requires an owner-configured safe URL; no tunnel or public endpoint is created. Old public image copies remain a historical limitation, not a claim of erasure.

## Architecture focus
AP-017/024/042 sanitized metadata and privacy; AP-020/026 explicit settings contracts; AP-027/043 trusted validated config and fixed-target commands; AP-028/075/076 executable installer/controller tests; AP-032 no query mutation; AP-054 clear unsupported/degraded UI. Author review must be distinguished from independent review; do not restart previously stopped review threads.

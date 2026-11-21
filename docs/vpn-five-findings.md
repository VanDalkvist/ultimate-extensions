# VPN five-finding remediation

## Design / scope
Explicit operator request: fix the five publication findings. Use the existing native Solid UI and controller API. Preserve live Mihomo configuration/mode/selection and BB; do not create a kill switch, routing probe or automatic daemon lifecycle manager. No history rewrite: already-public historical screenshots cannot be recalled by deleting HEAD.

Implementation calls: MIT for the separately owned controller wrapper (matching the collection, not relicensing the upstream Mihomo binary); truthful mode-only UI with a permanent no-protection-guarantee notice; cross-platform shell-free openers, configurable absolute config path and explicit safe Dashboard URL; preflight host typecheck; opt-in atomic replacement of a verified legacy symlink.

## Plan
- [x] License the daemon under MIT, set package license metadata and update the pinned dependency.
- [x] RED/GREEN mode presentation and UI-copy regressions: rule/direct/global labels never assert network protection. Keep the warning visible and control commands unchanged.
- [x] RED/GREEN platform settings: macOS/Intel/Linux/Windows config paths; trusted .env overrides; shell-free native editor commands and safe URL validation. Keep file contents/secrets out of DTOs. Disable misleading loopback Dashboard navigation for remote browsers unless an explicit secure browser URL is configured.
- [x] RED/GREEN installer preflight and conditional symlink migration. Reject incompatible/missing host SDK, foreign destinations and changed links; preserve legacy installation when readiness/preflight fails.
- [x] Remove only docs/usage.png and its capture code; ignore that exact file so it cannot silently return. Preserve other contributors' screenshots/extensions.
- [x] Run VPN/daemon suites, current-host typecheck, author architecture review and actual UI checks. Migrate the real symlink only from its verified old target after read-only readiness; refresh only the VPN extension if needed. Verify live state preservation.
- [x] Commit/push main plus annotated checkpoints; record receipts and update finding statuses without inventing independent acceptance.

## Acceptance
Tests cover exact command vectors for simulated platforms; only the current macOS host receives native/live verification. Unsupported older SDKs fail explicitly rather than being claimed compatible. Cross-host Dashboard access requires an owner-configured safe URL; no tunnel or public endpoint is created. Old public image copies remain a historical limitation, not a claim of erasure.

## Architecture focus
AP-017/024/042 sanitized metadata and privacy; AP-020/026 explicit settings contracts; AP-027/043 trusted validated config and fixed-target commands; AP-028/075/076 executable installer/controller tests; AP-032 no query mutation; AP-054 clear unsupported/degraded UI. Author review must be distinguished from independent review; do not restart previously stopped review threads.

## Verification receipts
- All 30 VPN tests and 5 daemon tests passed; host external-extension typecheck passed. RED cases were observed for missing mode presentation, wrong platform defaults/openers, incompatible-host acceptance, legacy migration refusal, tracked quota image, unsafe loopback variants, public screenshot output and credential-bearing settings metadata.
- Installer migrated only the verified old symlink to this collection's extensions/vpn; the legacy source folder remains intact. The real host passed SDK preflight and GET-only readiness.
- Real installed UI at 390×844: chip/header showed controller Rule mode, the permanent IP/DNS/kill-switch disclaimer was visible, both generic file controls were enabled, and expanded settings fit a 358×480 panel without horizontal overflow. No native secret file was opened and no live mode/power/probe control was pressed.
- Live config SHA256, daemon PID/start time and mode/selected proxy matched before/after. Browser session owned by this verification was closed.
- Quota image removed from the current tree and capture code. New screenshot evidence is private only; the capture CLI now rejects this public checkout, and AGENTS/ignore/staged-image checks prevent accidental publication. No new screenshot was committed. Existing historical public copies are not claimed erased.
- Public daemon license metadata resolves to MIT. Gitleaks current-tree scan reported no credential findings.

## Author architecture verification
Dependency traceability: settings/config functions invoke injected existence/exec ports; installer awaits SDK/readiness before any link swap. Runtime completeness: the installed canonical symlink and live settings DTO identify the new implementation, not the archived standalone checkout. Entry-point wiring: production settings actions and installer CLI are exercised through real HTTP fixtures; the actual installed UI displays the new contract. Anti-gaming: no fabricated protection/connection receipt, no removed command behavior, and no disabled tests.
Passed (author review): AP-017, AP-020, AP-021, AP-024, AP-026, AP-027, AP-028, AP-032, AP-042, AP-043, AP-054, AP-075, AP-076.
Residual risk: platform launches are contract-tested for Linux/Windows, not live-certified there; this is not a kill switch or traffic-leak audit, and old public image copies cannot be recalled. No new independent reviewer was run or represented as having approved this change.

Ruling: the installer now performs full SDK preflight (20s) plus GET readiness (5s). The old CLI test's 10s outer budget was no longer valid: a measured concurrent typecheck completed in 25s while that child was killed at 10.2s. The outer test budget is now 29s, within the existing 30s per-test limit; SDK production timeout was not raised. Final verification ran compiler-heavy checks serially, after closing only the owned preview browser.

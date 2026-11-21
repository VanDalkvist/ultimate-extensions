# VPN snapshot publication

Historical publication checkpoint. The subsequent five-finding remediation (licensing, mode-only UI, portable settings, quota-image removal and runtime symlink migration) is tracked in [vpn-five-findings.md](vpn-five-findings.md).

## Scope
Publish the sanitized VPN snapshot under extensions/vpn, without importing the standalone repository's Git history or screenshots. The separate mihomo-daemon repository becomes public. Existing collection extensions and the running VPN installation are unchanged.

## Implementation plan
- [x] Import only tracked VPN source/tests and helper scripts; keep the extension self-contained. No .git directory, private reports or configuration files.
- [x] Pin the daemon as an HTTPS submodule inside the extension. This keeps both copying/symlinking and external-extension checking functional without GitHub SSH credentials.
- [x] Adapt installer/typecheck/preview paths to extensions/vpn/scripts; preserve production controller/UI code byte-for-byte.
- [x] Verify the moved tests detect missing helper imports before fixing paths, then run all VPN/daemon tests and the host external-extension typecheck.
- [x] Scan the prospective public content for credentials and personal metadata; verify a fresh anonymous clone resolves the pinned public dependency.
- [x] Document platform, host-version, installation and runtime limitations. Commit/push main with an annotated checkpoint and verify remote visibility/ref state.

## Acceptance and risk boundaries
- Node 26+, a compatible Ultimate Solid 2 SDK, an already configured Mihomo Selector and loopback API are required. This is not an installer for the upstream daemon or Dashboard assets.
- Native configuration-file opening targets macOS Zed and the Apple-Silicon Homebrew config path; it is not a portable Linux/Windows editor integration.
- Dashboard URLs point to the browser's loopback address. A remote browser needs its own explicit secure forwarding arrangement; this extension does not create one.
- Power selects rule/direct runtime mode; it neither stops Mihomo nor disables TUN. Other controller clients, including BB, share these global settings.
- No OS-level egress, DNS/IP leak protection, kill switch or universal host-version compatibility is asserted by fixture tests/typechecking.
- Existing repository extensions/screenshots and their documented type noise are outside this VPN-only migration. Public source is not an authorization to expose Ultimate/Mihomo endpoints to the internet.
- The concurrent origin/main update added a root MIT license; it was preserved by a normal merge, alongside the other extensions. The separate daemon repository still has no LICENSE and was not silently relicensed.
- The prior standalone VPN repository stays private; its original history is neither imported nor rewritten. The existing installed symlink is not replaced automatically.

## Verified outcome
- The ten production controller/UI files are byte-identical to the sanitized standalone snapshot; only helper/test paths, package metadata and documentation changed for the new layout.
- VPN: 20 tests passed, including the real installer CLI against a disposable-home HTTP fixture and GET-only readiness; the moved helper import regression was observed failing before correction. Daemon: 5 tests passed. External-extension typecheck passed against Ultimate f3e60787.
- A fresh HTTPS recursive clone with global/system Git configuration disabled resolved the pinned daemon and passed all 20 VPN tests plus typecheck. A source ZIP or copying an uninitialized submodule is not equivalent.
- GitHub metadata confirmed the daemon public, enabled and unarchived. It had no Actions runs, issues/PRs or release assets before publication. Anonymous Git access was verified after visibility propagation.
- Gitleaks found no credential matches in the collection working tree or complete reachable daemon history. VPN-only metadata/image checks were clean; no standalone history or private reports were imported.
- A concurrent collection commit was merged without rebase/force-push; its MIT license, screenshot tool and existing extensions were preserved. Other collection screenshots, including the usage/quota image, were not removed by this VPN-only import.
- No new browser/native-editor acceptance was claimed for this path-only migration. Existing runtime installation, live Mihomo config/mode/selection and BB source were not changed.

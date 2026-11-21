# VPN snapshot publication

## Scope
Publish the sanitized VPN snapshot under extensions/vpn, without importing the standalone repository's Git history or screenshots. The separate mihomo-daemon repository becomes public. Existing collection extensions and the running VPN installation are unchanged.

## Implementation plan
- [ ] Import only tracked VPN source/tests and helper scripts; keep the extension self-contained. No .git directory, private reports or configuration files.
- [ ] Pin the daemon as an HTTPS submodule inside the extension. This keeps both copying/symlinking and external-extension checking functional without GitHub SSH credentials.
- [ ] Adapt installer/typecheck/preview paths to extensions/vpn/scripts; preserve production controller/UI code byte-for-byte.
- [ ] Verify the moved tests detect missing helper imports before fixing paths, then run all VPN/daemon tests and the host external-extension typecheck.
- [ ] Scan the prospective public content for credentials and personal metadata; verify a fresh anonymous clone resolves the pinned public dependency.
- [ ] Document platform, host-version, installation and runtime limitations. Commit/push main with an annotated checkpoint and verify remote visibility/ref state.

## Acceptance and risk boundaries
- Node 26+, a compatible Ultimate Solid 2 SDK, an already configured Mihomo Selector and loopback API are required. This is not an installer for the upstream daemon or Dashboard assets.
- Native configuration-file opening targets macOS Zed and the Apple-Silicon Homebrew config path; it is not a portable Linux/Windows editor integration.
- Dashboard URLs point to the browser's loopback address. A remote browser needs its own explicit secure forwarding arrangement; this extension does not create one.
- Power selects rule/direct runtime mode; it neither stops Mihomo nor disables TUN. Other controller clients, including BB, share these global settings.
- No OS-level egress, DNS/IP leak protection, kill switch or universal host-version compatibility is asserted by fixture tests/typechecking.
- Existing repository extensions/screenshots and their documented type noise are outside this VPN-only migration. Public source is not an authorization to expose Ultimate/Mihomo endpoints to the internet.
- No LICENSE is added automatically. Public visibility and a third-party reuse license are separate decisions.
- The prior standalone VPN repository stays private; its original history is neither imported nor rewritten. The existing installed symlink is not replaced automatically.

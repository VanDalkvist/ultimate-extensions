# VPN

Status-line VPN controls for an existing Mihomo controller: manual server/provider selection, latency refresh, independent general-traffic and AI-traffic gates, Dashboard and configuration-file shortcuts.

## Requirements
- Node 26+ and a compatible Ultimate **Solid 2** SDK; this snapshot uses the native web.solid.tsx entry. It is not the older React/island facet used by some other collection extensions.
- An already running/configured Mihomo controller on loopback HTTP (default 127.0.0.1:9090) with a manual Selector (default PROXY).
- MetaCubeXD assets already installed at /ui/metacubexd/ for the Dashboard link. The extension does not download them or configure Dashboard authentication.
- File opening uses the host OS: macOS default text editor, Linux xdg-open, Windows Notepad. Zed is optional via MIHOMO_EDITOR. Unsupported/headless environments retain copy-path controls; launch failures are explicit. Platform command vectors are tested; live UI/installer acceptance is on the current macOS host. Linux/Windows desktop launches are not claimed as live-verified.

## Install
For a fresh checkout, use `git clone --recurse-submodules https://github.com/VanDalkvist/ultimate-extensions.git`, then enter the checkout. From the collection root:

```sh
git submodule update --init --recursive
npm --prefix extensions/vpn run typecheck
npm --prefix extensions/vpn run install-extension
```

The dependency uses public HTTPS and is pinned under dependencies/mihomo-daemon. Clone the collection with --recurse-submodules; a GitHub source ZIP does not contain submodule contents.
No npm dependency installation is needed for VPN: browser facets use the host SDK. Set ULTIMATE_ROOT to an absolute Ultimate checkout path if it is not a sibling of this collection checkout.

The installer first typechecks against the chosen Ultimate SDK, then performs a GET-only readiness check and creates ~/.ultimate/extensions/vpn pointing to this folder. Missing/incompatible SDKs fail before any link change. It refuses foreign destinations by default. To migrate a known legacy symlink explicitly, run `npm --prefix extensions/vpn run install-extension -- --replace-from /absolute/path/to/old/vpn`. Only a symlink currently resolving to that exact old folder is atomically replaced, after preflight; files and changed/foreign destinations are never overwritten. No Mihomo/Ultimate restart or config write is performed.
When copying rather than linking, initialize the dependency first and include dependencies/ in the copy. Keep the extension folder name vpn.

## Configuration and use
Optional MIHOMO_API_URL, MIHOMO_API_SECRET and MIHOMO_PROXY_GROUP live only in ~/Projects/.env on the Ultimate server. The same file supports MIHOMO_CONFIG_PATH (absolute YAML path), MIHOMO_EDITOR (one executable/app name, never a shell command string), and MIHOMO_DASHBOARD_URL (explicit browser-facing HTTPS URL, or loopback HTTP; no credentials/query/hash). YAML defaults detect ARM/Intel Homebrew on macOS and ~/.config/mihomo on Linux/Windows, including an existing Linux XDG path. URL is restricted to loopback HTTP, without path, URL credentials, query or fragment. Secrets stay server-side; files are never served to the browser.
Click the shield or run VPN… in the command palette. Server choice is manual. The current branch adds separate selectors:
- GENERAL-GATE: PROXY or DIRECT for ordinary traffic.
- AI-NODES: separate manual selector built from the same `PROXY.use` subscription providers; it excludes static proxies and DIRECT.
- AI-GATE: AI-NODES or REJECT for AI domains.

Install the matching Mihomo config before using these controls. On the user's Homebrew macOS setup:

```sh
brew install yq
sudo env \
  MIHOMO_CONFIG_PATH=/opt/homebrew/etc/mihomo/config.yaml \
  YQ=/opt/homebrew/bin/yq \
  MIHOMO_BIN=/opt/homebrew/bin/mihomo \
  bash extensions/vpn/scripts/install-ai-gate.sh
```

The script backs up the YAML and previous AI rule file in `<config-dir>/.ai-gate-backups/<id>`, removes DIRECT/REJECT options from the manual PROXY selector, sets its `empty-fallback: REJECT`, builds AI-NODES from the existing PROXY group's `use` providers, and creates AI-GATE with only AI-NODES/REJECT. It inserts local AI domain rules at the **top** of the rules list and keeps mode=rule. Your static `shopproxy` remains available to ordinary traffic through PROXY while staying outside AI-NODES. It validates the temporary config with Mihomo's `-t -d <config-dir> -f <temp-config>` flags before replacing the active YAML, then reloads through the loopback API. It refuses to overwrite existing gate/provider names, because recreating selectors could reset the user's DIRECT/REJECT preferences. To reinstall the configuration, first use the printed rollback command, then run the installer again.

The installer prints a `--rollback <id>` command. Rollback restores the original YAML and the previous AI rule file (or removes the newly created rule file when there was no previous one). It checks SHA-256 hashes first and refuses to overwrite later manual edits.

The extension's general toggle changes GENERAL-GATE; the AI toggle changes AI-GATE. The panel treats a gate as active only while Mihomo global mode is `rule`; if another client changes it to `direct` or `global`, the panel warns and a gate action restores `rule`.

**Routing scope:** AI-GATE points to a dedicated `AI-NODES` selector. The installer builds it from the same `use` subscription providers referenced by your manual `PROXY` group. Static proxies such as `shopproxy` and DIRECT are excluded. Selecting a subscription node in the VPN panel mirrors that node into AI-NODES; selecting shopproxy leaves the previous AI subscription node selected. Provider entries still require protocol and TCP/UDP egress verification before confidential use.

AI-GATE blocks matching domains through Mihomo while the daemon/TUN are alive and rule mode is active. A daemon crash or TUN teardown requires a separate system-level macOS fail-closed mechanism. Settings are shared by other Mihomo clients, including BB.
The default Dashboard points to loopback. When Ultimate is opened on a remote hostname, the UI disables that misleading local link and explains how to set MIHOMO_DASHBOARD_URL for an existing secure forwarding setup. It does not create a tunnel or expose an endpoint. Native files open on the Ultimate host, not the browser device. Do not expose Ultimate or Mihomo to the internet to work around this limitation.
An enabled/rule indicator and a successful controller response are not proof of public-IP/DNS routing, connectivity or leak prevention. No such live-network test is asserted.

## Development
```sh
npm --prefix extensions/vpn test
npm --prefix extensions/vpn run typecheck
npm --prefix extensions/vpn run preview
```
The preview uses scripted loopback data and a disposable home, not the real VPN. Stop only its owned process with SIGTERM. Tests use synthetic credentials/names. No personal screenshots, config files or standalone Git history are included.
The daemon source is a separate repository, not the upstream Mihomo binary or a service installer. The VPN collection and the separate controller wrapper are both MIT-licensed; the upstream Mihomo binary retains its own license and is not bundled.

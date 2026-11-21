# VPN

Status-line VPN controls for an existing Mihomo controller: manual server/provider selection, latency refresh, Dashboard and configuration-file shortcuts.

## Requirements
- Node 26+ and a compatible Ultimate **Solid 2** SDK; this snapshot uses the native web.solid.tsx entry. It is not the older React/island facet used by some other collection extensions.
- An already running/configured Mihomo controller on loopback HTTP (default 127.0.0.1:9090) with a manual Selector (default PROXY).
- MetaCubeXD assets already installed at /ui/metacubexd/ for the Dashboard link. The extension does not download them or configure Dashboard authentication.
- Native file opening specifically uses macOS /usr/bin/open -a Zed. The YAML shortcut is /opt/homebrew/etc/mihomo/config.yaml (Apple-Silicon Homebrew); Linux, Windows, Intel/custom paths and other editors are not automatically supported. Copy-path controls remain a manual fallback.

## Install
For a fresh checkout, use `git clone --recurse-submodules https://github.com/VanDalkvist/ultimate-extensions.git`, then enter the checkout. From the collection root:

```sh
git submodule update --init --recursive
npm --prefix extensions/vpn run typecheck
npm --prefix extensions/vpn run install-extension
```

The dependency uses public HTTPS and is pinned under dependencies/mihomo-daemon. Clone the collection with --recurse-submodules; a GitHub source ZIP does not contain submodule contents.
No npm dependency installation is needed for VPN: browser facets use the host SDK. Set ULTIMATE_ROOT to an absolute Ultimate checkout path if it is not a sibling of this collection checkout.

The installer performs a GET-only readiness check and creates ~/.ultimate/extensions/vpn pointing to this folder. It refuses to replace an existing or conflicting installation. An installation made from a previous standalone checkout is not automatically migrated: disable/remove only its extension symlink after inspecting it, then rerun the installer. No Mihomo/Ultimate restart or config write is performed.
When copying rather than linking, initialize the dependency first and include dependencies/ in the copy. Keep the extension folder name vpn.

## Configuration and use
Optional MIHOMO_API_URL, MIHOMO_API_SECRET and MIHOMO_PROXY_GROUP live only in ~/Projects/.env on the Ultimate server. URL is restricted to loopback HTTP, without path, URL credentials, query or fragment. Secrets stay server-side; files are never served to the browser.
Click the shield or run VPN… in the command palette. Server choice is manual. Selecting while in direct mode enables rule mode. Power switches **rule/direct mode**, not the daemon or TUN; it is not a kill switch. These are global Mihomo settings shared with other clients, including BB.
Dashboard points to the browser's loopback address. A browser on another machine/phone cannot reach the Ultimate host's loopback controller without a separate explicit secure forwarding setup. Native files open on the Ultimate host, not the browser device. Do not expose Ultimate or Mihomo to the internet to work around this limitation.
An enabled/rule indicator and a successful controller response are not proof of public-IP/DNS routing, connectivity or leak prevention. No such live-network test is asserted.

## Development
```sh
npm --prefix extensions/vpn test
npm --prefix extensions/vpn run typecheck
npm --prefix extensions/vpn run preview
```
The preview uses scripted loopback data and a disposable home, not the real VPN. Stop only its owned process with SIGTERM. Tests use synthetic credentials/names. No personal screenshots, config files or standalone Git history are included.
The daemon source is a separate repository, not the upstream Mihomo binary or a service installer. Repository visibility does not grant an additional reuse license; no license is added implicitly by this publication.

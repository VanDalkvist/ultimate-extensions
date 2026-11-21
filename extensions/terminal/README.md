A bounded macOS and Linux terminal in the browser: one host PTY, started explicitly, with the shell's bounds stated where you start it.

**Open shell** in the title bar hands one trusted click to the committed Terminal surface; the Terminal tab, the phone
menu, the palette, tool cards and a restored view only navigate. **Start shell** in the view always starts one.

![Terminal: one shell, explicit start, its bounds in the header](../../docs/terminal.png)

## Bounds

- **The shell has full OS user privileges** and starts in the host's fixed project root. The project directory is not a
  sandbox: commands reach files and the network with your user's rights.
- One active PTY, a 30 second renewable lease, ten minutes maximum lifetime. A pending launch approval lives 30 minutes
  and creates no process.
- A 32 byte random capability bound to the admission login and address. Browser actions are user-only; this is not a
  sandbox against arbitrary code.
- Output is byte-bounded: 32 KiB per response, a 256 KiB buffer with pause at 192 KiB and resume at 64 KiB, 8 KiB per
  input event, 1 MiB per session.
- Close and expiry clean up jobs attached to the PTY, including foreground jobs in a separate process group. This is
  not containment: jobs that detach from the session can outlive it. On macOS, the extension does not scan for jobs
  after a natural shell exit because the controlling terminal can be reused.
- No dedicated listener, websocket, reconnect, session catalog or persistent terminal state. A transport failure does not
  reattach or extend the shell.

## Install

```sh
mkdir -p "$HOME/.ultimate/extensions"
cp -r extensions/terminal "$HOME/.ultimate/extensions/"
cd "$HOME/.ultimate/extensions/terminal" && npm install
```

Dependencies are pinned: `@wterm/dom`, `@wterm/react`, `@wterm/ghostty` 0.5.10 and `node-pty` 1.1.0. The two Pi
packages match the current Ultimate host and are installed locally so that a copied extension can load its server facet.
Use the same Node version and architecture as the host. `node-pty` uses its prebuilt addon where available or builds
with [node-gyp](https://github.com/nodejs/node-gyp#installation). The WASM asset is the custom ABI bundled with
`@wterm/ghostty`, not an official Ghostty binary.

To verify a source build on macOS with the host's Node (tested with Node 26 arm64), install the Xcode command-line
compiler tools and Python 3, then run from the installed Terminal directory:

```sh
cd node_modules/node-pty
npm exec -- node-gyp rebuild
```

The normal `npm install` is sufficient if the prebuilt addon is usable. For Linux build prerequisites, see
[node-pty's platform instructions](https://github.com/microsoft/node-pty/tree/v1.1.0#dependencies).

A bounded macOS and Linux terminal in the browser: one host PTY, started explicitly, with the shell's bounds stated where you start it.

**Open shell** in the title bar hands one trusted click to the committed Terminal surface; the Terminal tab, the phone
menu, the palette, tool cards and a restored view only navigate. **Start shell** in the view always starts one.

![Terminal: one shell, explicit start, its bounds in the header](../../docs/terminal.png)

## Bounds

- **The shell has full OS user privileges** and starts in the host's fixed project root. The project directory is not a
  sandbox: commands reach files and the network with your user's rights.
- One active PTY, ten minutes maximum lifetime. Manually started shells remain active when switching Ultimate
  surfaces; agent-owned shells retain their 30 second renewable lease. A pending launch approval lives 30 minutes
  and creates no process.
- A 32 byte random capability bound to the admission login and address. Browser actions are user-only; this is not a
  sandbox against arbitrary code.
- Output is byte-bounded: 32 KiB per response, a 256 KiB buffer with pause at 192 KiB and resume at 64 KiB, 8 KiB per
  input event, 1 MiB per session.
- Close and expiry clean up jobs attached to the PTY, including foreground jobs in a separate process group. This is
  not containment: jobs that detach from the session can outlive it. On macOS, the extension does not scan for jobs
  after a natural shell exit because the controlling terminal can be reused.
- On Agent → Terminal navigation, the new view inspects and reattaches to the same PTY, replaying up to 128 KiB
  of acknowledged output. Older output can be lost; this is byte replay, not an exact screen snapshot (full-screen
  programs may need to redraw). No new process starts. A real browser page unload closes manually started shells.
- No dedicated listener, websocket, session catalog or persisted terminal state. A server restart loses the session;
  a transport failure does not reattach or extend it.

## Install

Use the Ultimate host's Node version and architecture. On macOS, install the Xcode command-line tools and Python 3
first. On Linux, see [node-pty's build prerequisites](https://github.com/microsoft/node-pty/tree/v1.1.0#dependencies).
Then copy and install from the lockfile:

```sh
mkdir -p "$HOME/.ultimate/extensions"
cp -r extensions/terminal "$HOME/.ultimate/extensions/"
cd "$HOME/.ultimate/extensions/terminal" && npm ci
```

**macOS requires a source build after every `npm ci`.** The `node-pty` 1.1.0 prebuilt macOS arm64 package ships a
non-executable `spawn-helper`; installing it successfully does not mean a shell can start. Run this from the installed
Terminal directory before opening a shell (verified on Node 26 arm64):

```sh
(cd node_modules/node-pty && npm exec --yes --package=node-gyp@13.1.0 -- node-gyp rebuild)
```

Linux uses the normal `npm ci` path; the extra rebuild step is not needed. The two pinned Pi packages match the
current Ultimate host. The WASM asset is the custom ABI bundled with `@wterm/ghostty`, not an official Ghostty binary.

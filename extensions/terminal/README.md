A bounded Linux terminal in the browser: one host PTY, started explicitly, with the shell's bounds stated where you start it.

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
- No dedicated listener, websocket, reconnect, session catalog or persistent terminal state. A transport failure does not
  reattach or extend the shell.

## Install

```sh
mkdir -p "$HOME/.ultimate/extensions"
cp -r extensions/terminal "$HOME/.ultimate/extensions/"
cd "$HOME/.ultimate/extensions/terminal" && pnpm install
```

Dependencies are pinned: `@wterm/dom`, `@wterm/react`, `@wterm/ghostty` 0.5.10 and `node-pty` 1.1.0. `node-pty` builds
against the host's Node, hence the install step. The WASM asset is the custom ABI bundled with `@wterm/ghostty`, not an
official Ghostty binary.

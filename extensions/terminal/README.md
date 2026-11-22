A bounded macOS and Linux terminal in the browser: one host PTY, explicitly started, with a discoverable choice of installed shells.

**Open shell** in the title bar hands one trusted click to the committed Terminal surface; the Terminal tab, the phone
menu, the palette, tool cards and a restored view only navigate. **Start shell** in the view always starts one.

![Terminal: one shell, explicit start, its bounds in the header](../../docs/terminal.png)

## Shell choice (macOS and Linux)

The Shell dropdown discovers **installed** Zsh, Bash and Fish from `/etc/shells`, the login-shell environment and conventional system/Homebrew paths. A shell is offered only when its executable is present; it never installs packages or calls `chsh`.

- **System default** picks your OS account's login shell (with `$SHELL` only as fallback) when verified, falling back to Zsh on macOS or Bash on Linux, if available.
- Choose `/bin/zsh`, `/opt/homebrew/bin/zsh`, Bash or Fish to save that executable as the **Ultimate terminal default**. It persists via Ultimate's extension UI state across reloads/tabs, for user-started and approved agent-owned shells.
- Selecting another shell never stops a running PTY. The selection applies when the next shell starts. The server re-discovers and validates the executable before every launch, not merely when displaying the menu.
- Shells launch in login + interactive mode (`-l -i`) to load normal prompt, completion and user configuration. Your own startup scripts may enable history or run commands; this is a real OS shell, **not a sandbox**.
- If `chsh` says “no changes made” on macOS yet this Terminal still shows `bash-3.2A bounded macOS and Linux terminal in the browser: one host PTY, started explicitly, with the shell's bounds stated where you start it.

**Open shell** in the title bar hands one trusted click to the committed Terminal surface; the Terminal tab, the phone
menu, the palette, tool cards and a restored view only navigate. **Start shell** in the view always starts one.

![Terminal: one shell, explicit start, its bounds in the header](../../docs/terminal.png)

, the old extension's hardcoded Bash was the cause. The picker removes that hardcoded launch.

## Find and share with the agent

- **Find** searches only WTerm's retained output, with next/previous and match-case controls. Press **⌘F** on macOS, **Ctrl+Shift+F** on Linux/Windows; ordinary **Ctrl+F** remains Bash's readline shortcut. Closing Find restores focus to the shell. On compact viewports the popover stays inside the screen.
- **To agent** shares only a manually selected range, after an editable preview and explicit confirmation. The destination conversation is **frozen when the preview opens**: switching conversations blocks the send rather than silently redirecting potentially private logs. Maximum **12 KiB UTF-8** selected text, **24 KiB** once encoded. Control characters and fake boundary markers are represented as one quoted JSON data value, not executable instructions; this framing **cannot guarantee** immunity to prompt injection.
- No selection is captured or uploaded automatically. **To agent never grants shell access**. **Allow shell control** is a separate, high-privilege server-authorized command granting the agent read/write access to the real OS shell for up to five minutes. Removing/renewing access and sharing text must not be confused.
- If message delivery is not confirmed due to a network failure, **check the destination conversation before sending again**: a failed response does not prove rejection, and the preview disables blind resubmission. The client does not log or persist this selection; the confirmed message becomes part of the chosen agent conversation.
- The existing WTerm selection supports ordinary browser **Copy**; no second terminal renderer or xterm.js addon is installed.
- See [Terminal Experience research](../../docs/terminal-experience-research-2026-11-22.md) for ready-made open-source patterns and the next shell-integration/command-block slices.

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

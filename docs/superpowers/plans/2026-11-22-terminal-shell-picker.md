# Terminal: native shell discovery and default picker

Date: 2026-11-22. Branch: `fix/terminal-native-shell-and-workspace-chrome`. Based on actual user macOS screenshot and merged PR #5.

## Findings
- Terminal always spawns `/bin/bash --noprofile --norc -i`, hiding the user's installed zsh/fish and producing macOS Bash-3.2 migration notice.
- `chsh` changes the account login shell, not an explicit `node-pty.spawn('/bin/bash', ...)`.
- Three stacked header/status rows consume space without increasing functionality.

## Decision
- Add a bounded, read-only `shells` browser action returning installed supported interactive shells from `/etc/shells`, known macOS/Linux system/Homebrew locations and the real OS account shell when absolute. Never execute discovery candidates, never use `which` in arbitrary project PATH, never persist secrets.
- Supported launch adapters: `zsh`, `bash`, `fish`, with explicit `-l -i` per upstream docs. Avoid unsupported shell families until their launch and exit contracts are tested.
- Each candidate must be an absolute executable regular file (allow symlink to a regular file) whose resolved basename is supported. A selected explicit absolute path must match the fresh discoverable list when the privileged open action runs, not just a client-provided string.
- `System default` resolves the OS account login shell from `os.userInfo().shell` (fallback `$SHELL`) when verified, else /bin/zsh on macOS if installed, else Bash, else first discovered. The client receives the resolved default for display.
- Persist only shell selector via a React-compatible namespaced browser localStorage key, synchronized with storage and same-window events. The upstream `useExtensionUiState` hook is Solid-specific and cannot be assumed available in this React extension. This persists across reloads and tabs of the same origin, not across devices. This is *not* a trusted OS privilege boundary; server validates on every start. Changing default while shell runs changes the **next** shell only.
- Keep one PTY, explicit trusted Start, device capability, deadlines, agent grants, no shell spawning during discovery. Do not run `chsh`, modify `/etc/shells`, or install packages.
- Visually consolidate toolbar/status into a low-height shell workspace bar and optional error; preserve full OS access warning in tooltip/compact text.

## Test plan
1. Pure discovery tests from injected fs/OS constraints: macOS zsh, Linux bash, Homebrew fish, invalid/non-executable and stray PATH binaries, invalid requested selector.
2. Native mocked `node-pty.spawn` assertions for selected shell/flags, system default, rejection of arbitrary paths and no extra launch on `shells` query.
3. Ensure mobile/desktop toolbar, running shell reattach and agent permissions unchanged.
4. Full macOS/Linux host execution still needs real Ultimate runtime and node-pty; do not claim it passed if unavailable.

## Final architectural review after implementation

- P1 (fixed): React host compatibility of `useExtensionUiState`; migrated to tested `shell-preference-store.ts` with `useTerminalShellPreference` and server-side validation.
- P1 (fixed): stale shell during agent approval consumed the pending approval before validation; validate before consuming to preserve the pending grant request.
- P2 (fixed): corrupted README from string interpolation; repaired and adjusted persistence claims.
- P2 (fixed): incorrect ARIA radio-menu semantics without arrow-key navigation; use a normal pressed-button group with Tab/Escape accessibility.
- P2 (fixed): unavailable persisted shell permitted Start followed by generic error; disable Start and show a selection prompt.
- P2 (fixed): duplicated symlinked executable aliases, and stale/inherited `$SHELL`; deduplicate by realpath and prefer OS account shell.
- P2 (accepted): browser-local preference is not cross-device; no secrets are stored, and server checks selected absolute executable for every start.
- P2 (blocked): full TS bundle, real macOS/Linux PTY, render/layout and interactive TUI validation not run in connected runtime. Merge is user-authorized despite this known residual risk.
- P3 (logged): existing server module-global PTY state and single process model predate this PR; no unrelated refactor.
- Verification: 10/10 pure Node 22 tests (Git blob SHA matched); mocked node-pty permission tests written but not run with missing native SDK; structural review of all feature entrypoints.

# Terminal Experience — Research and delivery plan (2026-11-22)

Scope: `extensions/terminal` in Ultimate; desktop macOS first, Linux contract parity.  
Product stance: the host's shell is **an observable work surface shared by the human and the agent**, not another AI chat client or a clone of Warp.

## Baseline in this repository

- `@wterm/dom`/`@wterm/react`/`@wterm/ghostty@0.5.10`: real browser terminal with a Ghostty-based WASM VT core.
- `node-pty@1.1.0`: one real local Bash PTY with explicit Start and trusted browser admission; no new listener.
- Server-owned PTY/session/grant; the browser owns only WTerm viewport state.
- Manual PTY lifetime up to 10 minutes, with navigation reattachment and 128 KiB in-memory replay.
- Shell starts `/bin/bash --noprofile --norc -i` in the fixed project root, with HISTFILE disabled; do not assume user .bashrc, plugins or current working directory after `cd`.
- Browser context submission is already available through Ultimate's `api.submit(..., 'followUp', conversation)` (see upstream `docs/extensions/example-app.md`); no new agent provider integration is required.
- **Do not change macOS process cleanup to Linux /proc behavior**. Do not grant extra OS access as a side effect of a UI enhancement.

## Verified open-source alternatives and reusable patterns

| Source / license | Useful parts | Decision |
| --- | --- | --- |
| [vercel-labs/wterm](https://github.com/vercel-labs/wterm), Apache-2.0 | `search`, `findNext/findPrevious`, `getSelectionText`, `readText`, `scrollToPrompt`; Ghostty core, DOM selection, WebGL optional | **Already installed. Use existing API; do not replace.** |
| [xtermjs/xterm.js](https://github.com/xtermjs/xterm.js), MIT | Fit/Search/Serialize/WebLinks/WebGL addons | Sound alternative **only if renderer is migrated**. xterm addons do not attach to WTerm objects. |
| [coder/ghostty-web](https://github.com/coder/ghostty-web) | Another Ghostty WASM emulator with xterm-like API | Alternative renderer; no compelling gain relative to pinned wterm for this extension. |
| [VS Code terminal](https://code.visualstudio.com/docs/terminal/shell-integration), MIT codebase | OSC 7 working directory, OSC 133/633 command phases, exit codes, command navigation, action to attach terminal selection to chat | **Best workflow reference**. Build phase 2 on explicit shell integration and trust boundaries. |
| [WezTerm shell integration](https://wezterm.org/shell-integration.html), MIT | Explicit Bash/Zsh startup scripts emitting OSC 7 and OSC 133, without scraping command text | Reference protocol/approach; do not transplant without a license and macOS Bash 3.2 verification. |
| [Extraterm](https://extraterm.org/), MIT | Frame command/output as actionable blocks | Reference for command cards; not a reason to fork an emulator. |
| [Warp blocks](https://docs.warp.dev/terminal/blocks/block-sharing/) (product reference, not an OSS dependency) | Copy command vs output, per-command actions and readable grouping | Reference only; implement independently with OSC metadata. |
| [Zellij](https://github.com/zellij-org/zellij), MIT / [tmux](https://github.com/tmux/tmux) | Terminal multiplexer, split panes, persistent workspaces | Optional *user-installed* programs inside PTY; embedding their state into Ultimate requires a multi-session redesign. |
| [fzf](https://github.com/junegunn/fzf), MIT | Native fuzzy search in user shell | Optional local shell tool, not a browser terminal engine. |
| [Atuin](https://github.com/atuinsh/atuin), MIT | Persistent command history with context/exit codes | Optional opt-in provider; never quietly enable shell history collection. |
| [Starship](https://github.com/starship/starship), ISC | Git branch, language versions and cwd in a shell prompt | Optional local CLI, not a hard dependency or replacement for application UI. |

## UX architecture

The viewport must be the dominant area. The terminal should look like Ultimate:

1. **Compact, quiet chrome:** title and project path; actions `Find`, `To agent`, `Allow agent`, `Start/Stop`; secondary status is a thin strip (PID, grant), not a large permanent instructions card.
2. **Search is terminal-local:** `⌘F` on macOS, `Ctrl+Shift+F` on Linux. Do not steal Bash's `Ctrl+F` readline forward-character shortcut. Search only bounded WTerm scrollback. Keep the query/search state in the view, not the PTY protocol.
3. **Agent context is opt-in:** select text from the rendered terminal, click `To agent`, inspect/edit an actual text preview, confirm. Do not auto-capture stdout or file paths and do not automatically execute/summarize output. Bound the text to 12 KiB UTF-8; do not persist or log it. `api.submit` queues a follow-up, not a proof that the model already acted.
4. **Availability is truthful:** no current-cwd label unless OSC 7 is actually emitted; do not invent command duration or exit code by guessing ANSI/echoed text; do not claim search reaches discarded history.
5. **Security stays server authoritative:** UI tools do not bypass native terminal grants, log into a second identity, or add new terminal read endpoints.

## Delivery slices

### V1 — this PR: browser-only ergonomics
- Add Find using WTerm's actual v0.5.10 search API (not `@xterm/addon-search`).
- Add `To agent`: explicit selection → preview/edit → follow-up to active Ultimate conversation.
- Compact persistent status and UI while preserving clear full OS privileges and Stop semantics.
- Test byte-limit/untrusted-output framing, review contracts and manual keyboard/journey matrix.
- Excluded: shell input automation, new PTYs, permanent history, cloud or model integrations.

### V2 — shell-aware terminal (next; validate before writing)
- Inject a controlled, **opt-in** shell startup script from the extension (not automatic edits to `~/.bashrc`).
- Emit OSC 7 for real CWD, OSC 133 A/B/C/D for prompt/running/exit code. Test separately on macOS Bash 3.2 and Linux Bash 5.
- WTerm v0.5.10 exposes `onWorkingDirectory`, `onShellIntegration`, `scrollToPrompt`; **`ShellIntegrationState` is a latest phase snapshot, not an authoritative command log**. Command blocks require explicit bounded event capture at the PTY boundary, with OSC parser framing, no raw-log substring matching.
- Surface current directory, previous/next prompt, command status and copy command/output as independent actions. Preserve alternate-screen TUI behavior for Claude Code, Codex, Pi, Vim and fzf.
- Validate file:// host/path and OSC hyperlinks before browser navigation. Keep file-open integration inside the Files extension public API.

### V3 — agentic workflows (separate architecture decision)
- One task = one agent-facing terminal/worktree context; command blocks can be attached to a chosen conversation with user preview.
- Quick fix suggestions based on **verified** exit codes and command metadata. No silent AI calls.
- Multiple terminals/tabs/splits only after refactoring the server's single module-global `session`, admission/grant model, reader/ack protocol, OS cleanup and quotas; do not fake multiple shells with client-only tabs.
- Optional adapters to existing host fzf/Atuin/Starship/tmux/Zellij, discovered explicitly and enabled by the user, not installed silently.

## Validation matrix (PR gate)

- macOS: source-build node-pty per README, real shell starts, Stop cleans its PID; Cmd+F searches shell output, Escape exits; Cmd+C copies selection.
- Linux: existing node-pty build, Ctrl+F still reaches Bash; Ctrl+Shift+F searches.
- WTerm: search scans retained history, no misleading positive match count; Unicode and ANSI output can be selected; search doesn't inject shell input.
- Agent: no selection → no send; over 12 KiB → rejected; preview editable, cancel does not submit; confirm sends only selected data to the correct conversation; failure keeps preview; no automatic grant.
- Session: Terminal → Agent → Terminal retains one PID, no second PTY, no lost output beyond documented bounds; Stop, reload and 10-minute deadline retain former semantics.
- UI: 1080p and narrow layouts; keyboard focus; screen reader labels; no long-running status cards; toolbar popover remains inside viewport.
- TUI: `vim`, `less`, `fzf`, Codex/Pi interactive UI, cursor and alt-screen are not changed by browser controls.

No GitHub workflow is added. Verification must be runnable locally on a macOS/Linux Ultimate installation; do not claim native tests passed based solely on source review.

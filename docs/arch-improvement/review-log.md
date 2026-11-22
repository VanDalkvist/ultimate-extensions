# Arch Improvement Review Ledger — Ultimate Extensions

## Cycle 1 — 2026-11-22 — Terminal Agent ↔ Terminal Reattachment (PR #4)

### Context
- Branch: `fix/terminal-reattach-across-surfaces` (target `main`).
- Canon: `VanDalkvist/arch-improvement-skills/skills/arch-improvement-loop/SKILL.md`.
- Architecture baseline: `https://github.com/ai-meatbags/arch-rules/blob/main/arch-rules.md`.
- Plan: `docs/superpowers/plans/2026-11-22-arch-improvement-cycle-1-terminal-reattach.md`.
- Project memory: none at bootstrap.
- Stage: MVP. One server-owned host PTY, explicit launch, max lifetime 10 minutes.
- Source: `extensions/terminal/{web.tsx,server.ts,lifecycle.tsx,shell-launch.tsx}`.
- macOS and Linux use separate existing process cleanup; none of that logic was modified.

### S4 Findings / S5 Triage

1. **[P1] Concurrent reader takeover violates single-reader contract — fix-now.**
   - Evidence: previous PR `server.ts: actions.read` woke and waited for another reader before accepting a new one, while `test/read-ack.test.ts` requires rejection of concurrent reads.
   - Impact: two view read loops can race and advance/ack incompatible cursors.
   - Gates: AP-023, AP-034, AP-076.
2. **[P2] Inspect query wakes a waiting read — fix-now.**
   - Evidence: previous PR `server.ts: actions.inspect` called `s.wake?.()`.
   - Impact: merely inspecting changed a live reader's state. AP-032.
3. **[P1] Native reattach test accepted echoed command as execution — fix-now.**
   - Evidence: previous test used `output.includes('REATTACH_TEST_42')`, which interactive bash can satisfy just by echoing the command before executing it.
   - Impact: false success while primary work might never run. AP-075, AP-076.
4. **[P1] Malformed literal newline in shell-launch test — fix-now (verification unblock).**
   - Evidence: `test/web/shell-launch.test.tsx` included literal `\\n\\n` characters ahead of a test declaration.
   - Impact: syntax error prevents testing. AP-076.
   - Plan exception: discovered while inspecting test syntax during S8; bounded edit solely to unblock verification.
5. **[P2] Runtime black-box S9 unavailable — blocked.**
   - Evidence: linked GitHub source is readable but no installed Ultimate browser, node-pty runtime or macOS machine is accessible from this execution environment.
   - Impact: cannot assert the user-visible navigation or real native PTY passes.
6. **[P2] Pre-existing module-level mutable PTY state — blocked architecture work.**
   - Evidence: `server.ts` module scope `let session`/`let pending`.
   - Impact: cross-host instance interference risk under a multi-host loader; AP-074 critical.
   - Decision: needs a verified Ultimate extension registration/DI contract; do not silently replace with another hidden singleton or break exported `actions`.
7. **[P3] `server.ts` exceeds AP-019 size limit — log-only.**
   - Decision: avoid cosmetic fragmentation of a security-critical async pipeline without a runnable harness.

### S8 Fixes Applied
- **Single reader**: restored rejection for concurrent `actions.read` callers; only the authenticated `actions.control` resize command wakes a previous long-poll during viewer handoff.
- **Query/command separation**: removed reader wake and expiry side effects from `inspect`; expired sessions are not disclosed and normal periodic housekeeping terminates them.
- **Behavioral e2e**: assert a standalone `EXECUTED:42` output line that cannot be satisfied by bash input echo; verify original PID remains alive after a simulated 31-second gap, session identity persists, and Stop terminates the PID.
- **Regression tests**: `read-ack.test.ts` verifies Inspect does not disturb the pending reader and that an authorized resize drains that read; malformed test suffix corrected.
- **Existing behavior preserved**: one PTY, bounded output, privilege controls, agent grant and 30-second agent lease, macOS/Linux process kill, 10-minute absolute lifetime.

### S9a Architecture semantic probes (source-level)
1. **Dependency traceability:** server-owned `history` is written only in `acknowledge()`, exported by `inspect`, rendered in `web.tsx/run()`. `wake` connects authorized `control` to `read` wait. No decorative dependency added.
2. **Runtime completeness/split brain:** same `server.ts` owns all terminal native actions; `shell-launch.tsx` and `lifecycle.tsx` are used by `web.tsx`; no second PTY manager introduced. Pre-existing module-global ownership remains blocked.
3. **Entrypoint wiring:** `defineWebExtension` registers `TerminalSurface`, `actions.open/read/control/inspect` are exported and referenced by UI actions, `defineExtension` registers the native agent tool. Real PTY spawn is still `node-pty.spawn`.
4. **Anti-gaming:** e2e checks actual stdout from a real shell and process identity and lifetime, not a fake receipt. Test source inspected; full test execution remains outstanding.

### Security review
- Server `authorized()` still checks 32-byte capability, device login and address before read/control/close; `inspect` is limited to the admitted device.
- `secretReplay` stays in memory, capped at 128 KiB, is not written to docs/logs, and is only returned with the already device-authorized inspect response.
- An unauthorized invalid input cannot resize or wake a reader before authorization/validation succeeds.
- No change to process cleanup path; macOS `ps`-anchored and Linux `/proc` handling remains in `session-processes.ts`.
- Cross-browser-tab competing viewers remain a risk to validate against a live host.

### Verification
- PASS — GitHub compare `main...fix/terminal-reattach-across-surfaces`: only terminal feature files and cycle docs modified.
- PASS — source invariant checks: 12/12 (exclusive read, passive Inspect, authorized resize wake, memory bound, expiry behavior, reattachment wiring, pagehide, executed output/PID assertions, test source syntax markers).
- PASS — local Node 22 oracle: echoed command alone fails `/^EXECUTED:42\\r?$/m`; actual command-result line passes.
- **NOT RUN** — installed dependency suite `node --experimental-test-module-mocks --experimental-strip-types --test test/*.test.ts test/e2e/*.test.ts` (requires host setup and node-pty).
- **NOT RUN** — browser Solid/Vitest integration in the Ultimate host.
- **NOT RUN** — S9b independent black-box journeys on actual compiled macOS/Linux Ultimate: happy path, cold start, Stop/expiry/reload/error/agent-owned session.
- **VERDICT: FAIL / BLOCKED** — not a completed Arch Loop S9 dual-circuit PASS. PR stays Draft. Never report the test suite green without executing it.

### Residual risk / next gate
- Confirm real host-specific APIs, grant/admission, two-browser-tab behavior and one reader.
- Run native test suite on macOS (after required node-pty source rebuild) and Linux.
- Run browser navigation test: Start shell → Agent >30 seconds → Terminal → same PID and output; Stop cleans it; reload closes manual shell.
- Separately plan AP-074 instance scoping only after reading actual Ultimate loader contracts. Do not mix a speculative redesign into this PR.
- Gate does not permit merge. No claim of S10/S11 formal completion while S9 blocked.

### Provisional lessons for memory
- Never accept a PTY test triggered by echoed command text; assert command-specific stdout or OS-side effect.
- Distinguish UI view lifecycle, server PTY lifetime, and exclusive read ownership.
- An inspection query must not be used as an implicit command to interrupt active processing.


## Cycle 2 — 2026-11-22 — Terminal experience: security, product UX, cross-platform (PR #5)

### Context and source of truth
- Branch: \`feat/terminal-find-agent-context\` → \`main\` (Draft, no merge).
- Plan: \`docs/superpowers/plans/2026-11-22-arch-improvement-cycle-2-terminal-experience.md\`.
- Architecture baseline: \`ai-meatbags/arch-rules\`, AP-012/013/016/017/023/025/026/039/040/051/052/054/056/057/074/076.
- Project memories: PTY ownership is separate from view lifetime; native output cannot be verified from echoed shell input; Inspect is read-only.
- Contract evidence: pinned \`vercel-labs/wterm@v0.5.10\` \`WTerm.search\`, \`findNext\`, \`getSelectionText\`, \`onSearchChange\`; React wrapper exposes \`onReady\` but not \`onSearchChange\`; Ultimate upstream \`api.submit(message, 'followUp', conversation)\`.
- Source stage: MVP, unchanged single full-OS-privilege PTY on macOS/Linux; no server-side changes in this PR.

### S4 Findings and S5 decisions
1. **[P1] Wrong conversation could receive private terminal logs — fix-now.**
   - Evidence: \`terminal-agent-selection.tsx\` previously read live \`conversation\` at Send, not at preview creation.
   - Impact: switching Ultimate chats between selecting and sending silently retargeted private output (AP-013/AP-017).
2. **[P1] Prompt-injection boundary spoofing — fix-now, defense-in-depth.**
   - Evidence: \`terminal-agent-context.ts\` used static \`--- End selected terminal output ---\` delimiters embedded in the same user text.
   - Impact: attacker-controlled stdout could inject a look-alike terminator and apparent instructions (AP-016/AP-017).
   - Caveat: quoting untrusted output cannot guarantee model compliance; user approval and agent-side trust boundaries remain mandatory.
3. **[P1] Grant/revoke transport error killed a running PTY — fix-now.**
   - Evidence: \`web.tsx\` grant button \`catch { failed() }\` invoked terminal lifecycle failure, which terminates manual shells.
   - Impact: a UI-side access error could kill unrelated work and mask uncertain server permissions (AP-012/AP-023).
4. **[P2] Lost submit response and double clicks — fix-now.**
   - Evidence: no synchronous in-flight guard and "Could not send" after catch; a failed response may hide an already queued request.
   - Impact: accidental duplicate context submissions (AP-023/AP-054).
5. **[P2] Grant action mislabeled next to share action — fix-now.**
   - Evidence: \`Allow agent\` was adjacent to \`To agent\`; the former authorizes full shell control while the latter only shares text (AP-016/AP-054).
6. **[P2] Find reopen/close focus failure — fix-now.**
   - Evidence: \`setVisible(true)\` ran before the search input was mounted, while toolbar close did not restore shell focus (AP-054).
7. **[P2] Platform shortcuts and editor interception — fix-now.**
   - Evidence: old matcher accepted both Command+F and Ctrl+Shift+F on any OS; global bubble listener could run after WTerm input and matcher only excluded directly targeted editors, not descendants (AP-051/AP-054).
8. **[P2] Mobile overflow and missing user-extension utility classes — fix-now.**
   - Evidence: right-aligned Find popover could extend past viewport; personal extension installation may be outside the host Tailwind \`@source\` scanner. The host uses OKLCH CSS tokens \`--background\`, \`--popover\`, \`--border\`, \`--ring\`.
9. **[P2] Host product verification unavailable — blocked.**
   - No mounted Ultimate macOS/Linux UI runtime for compiled React/WTerm screen interactions. Cannot claim S9b PASS.
10. **[P2] Pre-existing module-global PTY state violates AP-074 — blocked outside PR.**
    - \`server.ts\` module globals \`session\`/\`pending\` were not introduced/changed here. Requires a separate verified host-ownership migration.
11. **[P3] \`web.tsx\` file size and cosmetic duplication — log-only.**
    - Do not split a security-sensitive PTY lifecycle merely to meet a line budget without integration tests.

### S8 Repairs
- **Frozen destination**: \`terminal-agent-selection.tsx:29,70-81\` stores the conversation ID with the preview and passes that ID only after \`terminalAgentSubmission()\` verifies the current conversation is unchanged. Mismatch disables Send and shows an alert.
- **Untrusted data framing**: \`terminal-agent-context.ts:13-47\` encodes selected text as one JSON literal, escapes ANSI/control and bidirectional formatting characters, limits raw selection to 12 KiB and formatted message to 24 KiB, and explicitly asks the agent not to follow instructions in logs.
- **Access failure isolation**: \`web.tsx:352-378\` uses a synchronous in-flight guard and server \`Inspect\` to reconcile after a lost grant/revoke response without calling \`failed()\` or closing the PTY.
- **Submit uncertainty**: \`terminal-agent-selection.tsx:67-96\` guards two rapid submissions, retains preview after failure, disables blind retry, and tells the user to check the destination conversation.
- **Explicit privilege copy**: \`web.tsx:386-387\` calls the permission action "Allow shell control" rather than "Allow agent"; \`To agent\` has a separate consent preview and grants no command execution.
- **Shortcut/focus**: \`terminal-keybindings.ts:14-20\`, \`terminal-find.tsx:46-86\` use platform-aware Command+F vs Ctrl+Shift+F, including macOS UA fallback; global capture precedes PTY input and skips dialogs/editable ancestors; mounted search input focuses/selects and closing returns focus to PTY.
- **Responsive CSS**: \`terminal-find.tsx\` provides measured narrow-viewport popover position; \`web.css\` defines layout-critical Find/preview styles in Ultimate's theme tokens even if the host scanner doesn't include user plugins. Full-screen TUI rendering code unchanged.

### S9a Architecture Semantic Probes
1. **Dependency traceability:** \`getSelectionText()\` → preview state → \`terminalAgentSubmission()\` → \`api.submit(..., followUp, selectedConversation)\`. \`WTerm.search/findNext/findPrevious/onSearchChange\` are exercised by actual Find handlers. All dependencies have runtime call paths.
2. **Runtime completeness/split brain:** unchanged single \`TerminalSurface\`, \`WTerm\` instance, \`server.ts\` PTY owner; no extra terminal renderer, duplicate service, native command path, network API, or hidden fallback introduced.
3. **Entry-point wiring:** both \`TerminalFind\` and \`TerminalAgentSelection\` remain rendered by \`web.tsx:TerminalSurface\`; \`defineWebExtension\` registers the same Terminal surface. Existing native \`actions.control/read/inspect/grant/revoke\` contracts remain unchanged.
4. **Anti-gaming / assertion integrity:** pure tests exercise destination mismatch, untrusted delimiter/control attacks, UTF-8/encoded limits, and Mac/Linux/Windows key combinations. They do not fabricate a browser interaction result; unrun UI journeys are marked NOT RUN.

### Verification
- **PASS:** Node v22.16.0 \`node --experimental-strip-types --test test/agent-context.test.ts test/keybindings.test.ts\` (isolated copy of actual GitHub blobs).
- **PASS:** 12 tests, 0 failures; Git blob SHA of all 4 tested source/test files confirmed to match PR contents: context \`9f2882a...\`, keybindings \`4d08d7a...\`, context test \`c18df11...\`, keybindings test \`c2715f1...\`.
- **PASS:** source-level inspection of pinned WTerm v0.5.10 methods and host extension call signatures; server PTY files untouched in PR diff.
- **NOT RUN:** full Ultimate typecheck and bundled browser UI, visual responsive/cross-platform regression, macOS Node native PTY build (including required source rebuild), Linux Node native PTY tests and real command/agent submission flow.
- **S9 dual-circuit VERDICT: FAIL / BLOCKED**, not PASS: independent black-box product review cannot execute from this environment. PR remains Draft and unmerged.

### Product acceptance still necessary
- macOS: Command+F opens Find, selects existing query, Escape/close restores WTerm input, shell Control+F still reaches readline. Verify keyboard selection and pointer selection, send preview, no double delivery.
- Linux/Windows browser: Ctrl+Shift+F opens Find, Ctrl+F reaches shell. Confirm mobile-sized and narrow nested Ultimate panels without clipping.
- Security: select text including secrets/prompt-injection markers; preview/edit/cancel; switch conversation before Send; verify there is no cross-chat transfer; a lost response shows honest uncertainty and does not automatically retry.
- Grant: simulate timeout after grant/revoke; live shell remains alive, Inspect reconciles permissions, user sees warning.
- TUI: Codex/Pi/Vim/less/fzf alt-screen and mouse/keyboard unaffected by new controls.
- S9 cannot become PASS just because raw source review and isolated unit tests pass.

### Lessons for memory
- Bind sensitive manual shares to an immutable target at preview time, not live UI state at submit time.
- Losing a protected command's response is *not* proof the command failed; reconcile, never kill a separate user session.
- Browser keyboard shortcuts must be intercepted before the terminal's input handler and must be tested with browser platform semantics.
- Installed extension CSS may require explicit theme-token fallbacks beyond the host Tailwind source scanner.


## Cycle 3 — 2026-11-22 — Shell discovery and compact workspace chrome (PR #6)

### Context / S0-S3
- Scope: user-reported Bash 3.2 problem and excessive stacked Terminal chrome in actual macOS screenshot; follow-up explicitly authorized final architecture review **then merge**.
- Branch: `fix/terminal-native-shell-and-workspace-chrome`, based on merged PR #5.
- Source of truth: actual `node-pty.spawn('/bin/bash', ['--noprofile','--norc','-i'])` was the problem; `chsh` cannot change a hardcoded child executable.
- Canon: `VanDalkvist/arch-improvement-skills/skills/arch-improvement-loop/SKILL.md`; memory: keep native PTY life separate from viewport, preserve read authorization, avoid false test success.
- Context map: `server.ts` owns one privileged PTY and user/agent admission; `shells.ts` handles discovery/validation; `web.tsx`/picker displays local preference and calls `actions.open/approve`. Browser-stored shell path is untrusted input.

### S4 Severity findings / S5 decisions
1. **P1 fix-now: persistent default used a Solid-only SDK hook inside a React extension** — `web.tsx` imported `useExtensionUiState` but the available upstream SDK docs only declare the hook in `web/src/sdk/solid.ts`. Replace with React-compatible local browser preference + explicit same-origin/tab sync. Cross-device sync excluded.
2. **P1 fix-now: agent approval lost on invalid shell selection** — `actions.approve` previously consumed `pending` before validating `args.shell`; a stale saved path would discard an approved request with zero shell. Validate first, then consume.
3. **P2 fix-now: noninteractive executable or arbitrary path could have been selected** — fail-closed server-side candidate registry from `/etc/shells` and standard install paths, require absolute executable regular-file and recognized basename, do not consult arbitrary project PATH or execute discovery.
4. **P2 fix-now: wrong fallback to inherited `$SHELL` / duplicate symlink paths** — prefer `node:os.userInfo().shell`, validate it, deduplicate candidates by realpath.
5. **P2 fix-now: invalid saved shell allowed a Start click and generic failure** — disable start until available catalog and valid choice; give actionable guidance.
6. **P2 fix-now: ARIA menuitemradio without arrow navigation** — convert to pressed-button group using native Tab/Escape semantics.
7. **P2 fix-now: corrupted README plus inaccurate persistence promise** — rebuild the affected section; state browser-local persistence honestly.
8. **P2 blocked: full frontend/native integration** — actual macOS/Linux Ultimate processes, compiled React and visual 1080p/narrow product checks are unavailable here.
9. **P3 log-only: pre-existing PTY module globals and single-session design** — separate architecture task, out of shell selector scope.

### S6-S7 Plan
- Written plan: `docs/superpowers/plans/2026-11-22-terminal-shell-picker.md` and its final-review addendum.
- Preserve native `authorized()`, PTY server cursor/ack, OS cleanup, 10-minute absolute deadline, explicit Start, manual/agent approval distinction.
- No shell command injection via a path: `shellForStart` accepts only a re-discovered exact executable path; args are fixed `-l -i`; no `sh -c`, no extra server listener.
- User-approved product goal: select zsh/bash/fish in Terminal and remember the default for future local sessions.

### S8 Fixes
- Added `shells.ts` and tests: read-only discovery, OS login shell, /etc/shells, platform paths, executable checks, realpath alias dedup, exact selected path enforcement.
- Replaced hardcoded `/bin/bash` spawn with validated selected executable; metadata includes shell; user and agent approval paths share selection, and validation precedes consuming a pending request.
- Added compact workspace toolbar with current shell, running dot, project path, Find/To agent, explicit grant and Stop. Removed redundant permanent PID/status strip. Responsive styles remain in extension-owned CSS.
- Added `shell-preference-store.ts` + React `shell-preference.ts`, namespaced `localStorage` key and storage event, instead of assuming unsupported Solid hook. This stores path only, never shell output or capabilities.
- Added honest no-shell/invalid-default handling and fixed README.
- Old Bash-dependent native E2E tests pinned `/bin/bash` to retain their existing command execution assertions; augmented mocked native tests for discovery and invalid agent approvals.

### S9 Verification & limitations
- PASS: **10/10 actual Node v22 pure unit tests**, with Git blob SHA of tested shell discovery and preference files matching the PR. Covers macOS/Linux defaults, Homebrew fish, invalid shell injection, lack of executables, symlink aliases, blocked storage, persistence, corrupt preference.
- PASS: **source-level API and entrypoint check**: one `node-pty.spawn(selected.path, ['-l','-i'])` behind fresh server-side validation; `userActions` includes discovery; browser picker and agent approval use same preference; no second PTY, new GitHub Actions, or permission weakening.
- NOT RUN: native permissions test with `node-pty`/Pi SDK installed, full app typecheck/React bundle, real macOS/Linux zsh/fish startup, visual responsive layout, alt-screen TUI, cross-tab browser integration.
- **S9 dual-circuit VERDICT: BLOCKED** — no false claim of full host verification. User explicitly requests merge after architecture review with these disclosed residuals.

### S10-S11 Lessons
- Shell default selection is a *display preference* until validated at the server-side privileged spawn boundary.
- Avoid assuming SDK hooks exist across framework migrations; browser-safe persistence may be a better bounded compatibility shim.
- Validate before consuming one-shot approvals, and do not confuse a user-controllable preference with permission to choose any OS executable.
- Reconcile documentation/UX with actual behavior before release; structural CSS checks and pure tests do not replace live product verification.


## Cycle 4 — 2026-11-22 — Final Arch Review after full Solid 2 migration (PR #6)

### S0–S3: scope and architecture
- User explicitly extended PR #6 from React shell-picker work to **rewrite the whole Terminal web facet on Solid**, then perform final architecture review and merge. This supersedes the earlier draft hold.
- Canonical host: \`HazAT/ultimate\` current \`extensions/README.md\` and \`skills/solid-ui/SKILL.md\`: a \`web.tsx\` facet is obsolete/error-card; correct contribution is \`web.solid.tsx\` with \`@/sdk/solid\`, \`@lucide/solid\`, Solid 2 accessors and \`onSettled\`.
- UI trust diagram: Solid view → \`api.action\` → existing server-owned PTY; terminal output → WTerm DOM/Ghostty → opt-in preview → \`api.submit\` to immutable conversation. User-granted shell access is independent from output-to-agent share.
- Reused previous PTY learning: user-owned shell survives surface detachment, but closes on page unload; agent-owned shell retains 30-second renewable lease; read has one ack cursor and no retry of writes.

### Final severity-ranked findings and actions
1. **P1 fixed — obsolete React facet would be rejected by modern Ultimate.** Removed \`web.tsx\` and React child components. Introduced exactly one \`web.solid.tsx\` and Solid child files, registering \`TerminalSurface\`, tool renderer and titlebar contribution through \`defineWebExtension\`.
2. **P1 fixed — framework/SDK mismatch and lost persistent preference.** Replaced React localStorage shim with real Solid \`useExtensionUiState<string>('default-shell','system')\`; all readers use \`useAction\` accessors. Same durable selection is used by user and agent-approved opens and is validated server-side.
3. **P1 fixed — direct browser terminal lifecycle could double-own / lose PTY.** Added \`terminal-emulator.solid.tsx\` to create/destroy exactly one \`WTerm\` at Solid \`onSettled\`, explicitly disable WebMCP, use \`@wterm/dom\` pinned 0.5.10 API. Reused unchanged \`terminalViewLifecycle\`, \`shellLaunch\`, read/ack/retry and serialized control queue; no second shell or session ownership introduced.
4. **P2 fixed — old \`@/sdk\` ActionError import would fail after Solid port.** Moved framework-independent lifecycle/launch/retry helpers from \`.tsx\` to \`.ts\`, moved \`ActionError\` import to \`@/sdk/solid\`, and updated Vitest alias and regression test imports.
5. **P2 fixed — unused React wrapper caused dependency/runtime drag.** Removed \`@wterm/react\` plus its orphan \`react\`, \`react-dom\`, \`scheduler\` lock nodes; package.json and lockfile root dependencies match exactly. Existing Ghostty core, DOM, node-pty and Pi versions unchanged.
6. **P2 fixed — stale/default-unavailable shell could strand an approval.** Server validates shell before consuming one-shot approval; Solid ApprovalCard now reads shell catalog, lets the user select a valid shell in the approval itself, and disables approval until valid.
7. **P2 fixed — UI controls still React-bound.** Reimplemented Find (keyboard capture and search callbacks), agent selection (12 KiB preview + fixed conversation + uncertainty guard) and shell picker (accessible native buttons) with Solid signals and lifecycle cleanup.
8. **P2 accepted — design and client confidence.** Compact one-row toolbar leaves viewport dominant. CSS and WTerm DOM respond to host theme, but 1080p/narrow browser screenshot testing not possible here.
9. **P2 blocked — black-box host verification.** No compiled current Ultimate running in this environment, so cannot execute official \`node scripts/check-extension.ts terminal\`, full typecheck, macOS/Linux PTY integration, Solid 2 component tests, or real tab/approval/product workflows.
10. **P3 deferred — prior architecture debt.** The server's module-global single session and non-persistent shell transcript remain separate known debt; do not combine with Solid migration.

### S6–S8 plan and execution
- Existing plan \`docs/superpowers/plans/2026-11-22-terminal-shell-picker.md\` was amended by user scope while PR was in progress. The implementation retained a single end-to-end walking skeleton: \`web.solid.tsx\` → \`TerminalEmulator\` → \`WTerm.init\` → native \`actions.open/read/control\` → user-visible output → \`WTerm.destroy\`/detach.
- Pure helpers remain single-source: \`shells.ts\` and tests, \`terminal-agent-context.ts\`, \`terminal-keybindings.ts\`; no hidden simulated server.
- The \`web.tsx\` and all remaining non-Solid UI TSX files are removed. Tests previously named \`.test.tsx\` contain no JSX and are renamed to \`.test.ts\`; the user extension now has **one** \`web.solid.tsx\` facet.
- No automatic GitHub workflow added; user requested manual Actions only.

### S9 evidence
- **PASS, unit:** 12/12 \`node --experimental-strip-types --test\` isolated tests for byte-bounded untrusted context, frozen conversation, delimiter/control attacks and macOS/Linux/Windows Find shortcuts.
- **PASS, unit:** 7/7 isolated shell-discovery tests for account defaults, macOS/Linux paths, Homebrew fish, invalid injection paths and realpath aliases.
- The six tested source/test Git blob SHA values all match the current PR files exactly (\`terminal-agent-context.ts\`, \`terminal-keybindings.ts\`, \`shells.ts\` and their three tests); these are actual Node v22.16.0 tests, not a fabricated static result.
- **PASS, static:** 20/20 *source invariants* reviewed against committed branch: only Solid facet, no React import/dependencies, native WTerm mount/destroy, WebMCP disabled, server validation and single PTY, durable preference, user/agent approval, context-share boundary, keybinding capture, unchanged grant and read protocols.
- **NOT RUN / BLOCKED:** full Ultimate build/typecheck, native mock permission suite under real deps, macOS/Linux Node-PTY process test, exact visual UI, TUI and cross-tab runtime. Source invariants cannot substitute for these.
- **S9 dual-circuit result: BLOCKED**, not a full functional PASS. User explicitly requested to merge after this final review despite the unexecuted real-host validation. Do not misrepresent the result.

### S10–S12 closure
- Change surface: Terminal folder and arch docs only. No server permission relaxation, new Action trigger, second PTY, or shell command from search/preview.
- Final disposition: suitable for a **user-authorized merge with disclosed runtime risk**; immediately follow up with actual Ultimate terminal smoke checks after deployment.
- Post-merge branch hygiene: former PR #4 and #5 heads each have 0 commits ahead of \`main\`; safe to delete. Branch deletion needs a dedicated Git ref delete capability; do not pretend moving refs equals deletion.


## Cycle 5 — 2026-11-22 — Obsolete React facets after Ultimate 0.1

**Context:** The user reported `files`, `skyscraper`, `subscription-usage` failing in their actual Ultimate UI. Ultimate upstream `extensions/README.md` confirms React `web.tsx` was removed in 0.1; the supported facet is `web.solid.tsx`. Prior Terminal source checks missed a real `ActionError` export incompatibility, so source inspection must not be presented as proof of a running extension.

**Scope and source map:**
- `VanDalkvist/ultimate-extensions`: `subscription-usage`, `right-panel-resize`, `files`.
- **`VanDalkvist/bb-plugin-skyscraper`: separate repository.** Its extension must remain there; dedicated draft PR #2. No skyscraper files copied into `ultimate-extensions`.
- Files is in a separate draft PR #8 because it contains unsaved user data and autosave; this branch only carries Subscription Usage and right-panel-resize.

**S4–S8 severity review / repair:**
- **P0 fixed in PR #7:** `subscription-usage/web.tsx` is rejected by Ultimate 0.1. Reimplemented status-line chip, panel, per-provider refresh, pin/unpin, error/stale display and event-driven shared reads as `web.solid.tsx` using supported `@/sdk/solid` and `@lucide/solid`. Original provider/cache `server.ts` unchanged.
- **P1 fixed in PR #7:** `right-panel-resize/web.tsx` was a stale React wrapper alongside an already-native `web.solid.tsx`. Deleted only the old facade; kept Solid overlay and server-independent resize implementation untouched.
- **P1 isolated to separate repo:** Skyscraper's React iframe panel is migrated in `bb-plugin-skyscraper` draft PR #2. No cross-repository code copy or game runtime changes.
- **P1 isolated to separate PR:** Files' 700ms autosave, recovery snapshots and Tiptap lossless Markdown editor require a migration without silently losing data; draft PR #8, not merged.
- **P2 documented:** Installed `~/.ultimate/extensions/*` are local copies. A commit to remote GitHub does not update them, and simply adding `web.solid.tsx` without deleting obsolete installed `web.tsx` will not necessarily clear the React error card.

**S9 source checks:** The changed Subscription Usage and resize directories each contain exactly one `web.solid.tsx`, zero remaining `web.tsx` or React/lucide-react/old SDK imports. Native Usage server unchanged. SDK contracts compared with upstream `docs/extensions/actions.md` / `docs/extensions/slots.md` (accessor readers, event subscription, panel and status slot).

**S9 outcome: BLOCKED, NOT PASS.** The compiled Solid build, browser error-card disappearance, actual provider actions and macOS visual interaction are not executed here. Draft PR #7 awaits running host verification. No GitHub Actions added.

**S10 learning:** Always inventory *all installed facets* and the actual host framework version before porting an individual component. Isolation by repo/extension is not a reason to put a product plugin into a shared tooling repository. Keep high-risk user-data migrations apart from low-risk panel upgrades.

## Cycle 5B — 2026-11-22 — Files Solid 2, preserve drafts (Draft PR #8)

**Source context:** Ultimate 0.1 rejects React `web.tsx`; user reported a real Files error card. Unlike Skyscraper (which remains exclusively in `VanDalkvist/bb-plugin-skyscraper`), Files belongs to `ultimate-extensions`. Current upstream `extensions/README.md`, `skills/solid-ui/SKILL.md`, `docs/extensions/actions.md` and SDK provide the contract.

**S0–S3 map:** Solid surface → read-only directory `list` action → in-memory session/tab buffers → `read` and version-checked `save` native actions. Tiptap editor receives/sends Markdown through the existing lossless validator. Browser `sessionStorage` keeps drafts under the original `ultimate.files:<root>` key; file link bus is tab-local. File server and its allowlists must not change.

**S4–S5 severity and decisions:**
1. **P0 fixed at source level:** obsolete `web.tsx` deleted; exactly one `web.solid.tsx`, Solid tree/editor/preview and current `@/sdk/solid` UI kit.
2. **P1 preserve:** do not replace version-aware autosave/conflict behavior. Existing `createSession` and `buffers` algorithms copied into plain TypeScript without changing write semantics; 700 ms debounce, pending requests, draft recovery, pause before discard and failed-write handling retained. Solid only subscribes to the existing observable store and reconciles a mount race.
3. **P1 preserve:** Tiptap lossless core and frontmatter/BOM/Markdown semantics were moved without rewriting validation/paste/serialization; Solid component only owns DOM/editor mount/receive/destroy.
4. **P1 safety:** unsupported Markdown preview no longer can use React Streamdown. Replaced it with a **non-interactive Solid AST renderer** that never creates `<a>`, `<img>`, `innerHTML` or executes raw HTML. Source mode remains authoritative. Formatting differs from Streamdown and needs human comparison.
5. **P1 blocked:** a successful source transformation does not prove no draft loss. Actual host autosave/in-flight edits/conflict reload/recovery and Tiptap caret/IME must be tested before merging.
6. **P2 partial:** package importer removed React, React DOM and Streamdown; orphaned pnpm snapshot entries remain (harmless if frozen lockfile accepts them; installer check pending).
7. **P2 compatibility:** Solid 2 `useAction` accessors, durable `useExtensionUiState`, `onSettled`, `For`, `Show` and kit buttons now used; no direct React rendering inside Solid.
8. **P3 deferred:** editor orchestration still shares a long `web.solid.tsx`; avoid speculative refactoring of sensitive dirty/save flow before browser acceptance.

**S6–S8 execution:** copied `buffers.tsx → buffers.ts`, `markdown-document.tsx → markdown-document.ts`; split Tiptap to `markdown-editor.ts` plus `markdown-editor.solid.tsx`; Solid-only tree and inert preview; ported session subscription and UI commands; test imports preserved and SSR preview test rewritten for safe AST source; removed seven obsolete `.tsx` React files. Server `actions` unchanged.

**S9 verification:** source inventory shows **one** `extensions/files/web.solid.tsx`, zero leftover non-Solid `.tsx` files in Files, no React-specific UI code in changed modules. Original pure-state tests retained and redirected to new paths. Full `pnpm install --frozen-lockfile`, TypeScript/OXC Solid compilation, Vitest, browser visual and real macOS editor/autosave/conflict/recovery **NOT RUN**. **S9 dual-circuit verdict BLOCKED — do not merge PR #8 solely on static checks.**

**S10 lessons:** preserve user data/model and one-shot save protocols during a framework migration. Browser-generated state and editor focus cannot be validated with a file-naming check. Keep large high-risk changes isolated from unrelated panel upgrades and from independently maintained projects like Skyscraper.


## Cycle 6 — 2026-11-22 — Subscription Usage fails on Ultimate 0.1 boot

**User evidence:** after updating the installed Ultimate, terminal reported `Read subscription-usage/status failed` and `Automatic restart: Error: System is not ready`. Current Ultimate source and installed extension repo are the evidence; no runtime log beyond those two lines is available.

**Root finding (P1, fixed):** `extensions/subscription-usage/server.ts` still called `host.onRelease()`, which is absent from current `server/extensions.ts` and the published `docs/extensions/server.md` contract. The available lifecycle is `onOpen(async opened => opened.defer(cleanup))` plus process-scoped `onClose`. The outdated call can prevent the facet from installing; a browser `status` read then fails.

**Secondary finding (P2, upstream):** current Ultimate `extensions/update/server.ts` has an onLoadError auto-restart check that calls `host.system()` before `createSystem` finishes in `server/main.ts`, producing `System is not ready`. This can mask the initial failed facet. It is upstream code, not changed by this repair.

**Fix:** `server.ts` uses a small pure `registerUsageLifetime` adapter: it registers `opened.defer(() => tracker.close())` before `tracker.open()`, so every core release stops pending requests before the reload-stable SQLite resource is destroyed. No network endpoint, provider auth, database schema, credentials or usage cache changed. Added `scripts/install-subscription-usage.sh` to copy the new server and Solid facet into the *installed* `~/.ultimate/extensions/subscription-usage/` and preserve modified/old files as backups. It leaves `~/.ultimate/subscription-usage.sqlite` untouched.

**Verification:** 2/2 Node v22 tests exercising repeated open/dispose cycles and removal of `onRelease` pass. Both tested file Git blob SHA values match source on `main`. Current host API checked against upstream server lifecycle and startup implementation. Actual Ultimate macOS core restart, provider HTTP reads and live status-line UI **NOT RUN** from this environment.

**Disposition:** fixed in main, local install script supplied. If the warning survives installed file sync, inspect earlier facet load failures (the update auto-restart warning is downstream) rather than treating it as a Usage quota/credential problem.


## Cycle 7 — 2026-11-22 — Terminal entry, Usage pane and discovery-aware installation

### S0/S1/S2 Context
- User evidence: Usage status indicator visible but its panel does not open; Skyscraper still shows Ultimate 0.1 React facet error despite Solid in its separate repository; Terminal requires pressing Start again and user suspects shell sessions are reset.
- Repo is `VanDalkvist/ultimate-extensions`; Skyscraper changes remain **only** in `VanDalkvist/bb-plugin-skyscraper`.
- Prior lessons: React/Solid web and server SDK must match installed Ultimate; do not confuse a GitHub merge with installed extension updates; distinguish user-held capabilities from view lifetime; reattachment must retain exclusive read/ack semantics. Canonical orchestration: `arch-improvement-loop/SKILL.md`.
- Host context: `lib/discovery.ts` discovers builtin → user → project with last name winning; `webFacet` prefers `web.solid.tsx` over React **within one directory**. `openPanel(id)` only changes panel state; `Panels` mounts on the Agent surface, not Terminal/Files.

### S3–S5 Approved design / ranked findings
1. **P1 fixed — Usage indicator action invisible on Terminal/Files.** Clicking a global status item cannot assume the current surface mounts `Panels`. Use native `StatusButton` inside `TooltipTrigger`, and route through `showSurface('agent')` then `openPanel('subscription-usage')`. Command-palette action uses the same helper.
2. **P1 fixed — Usage installed copy missing imported `navigation.ts` / project overrides.** Installer used a stale manual filename list and only wrote user-level extension, while a project-level copy could shadow it. Installer now synchronizes all top-level `.ts` + `.solid.tsx` with backups, validates both user and present project directories, checks unexpected symlinks, leaves SQLite/auth untouched.
3. **P1 fixed — Terminal cold visit requires separate Start.** `autoStartOnVisit` requests launch only once per mounted Terminal view and only after WTerm is ready and selected shell exists. Existing `shellLaunch` always inspects for an active PTY first, avoiding duplicate processes. Agent-owned shells still require approval.
4. **P1 fixed — Terminal browser pagehide was killing user PTY.** View now aborts its reader and detaches; existing server deadline remains 10 minutes absolute. Explicit Stop still closes. Browser refresh can reattach if the core and PTY remain alive.
5. **P1 fixed — BFCache and race on in-flight inspect/open.** `pageshow` re-inspects and preserves the return intent when the old `inspect` or `open` request is stale. An orphaned capability from a stale Open is closed exactly once. No write retries or speculative PTY creation.
6. **P1 fixed in external repo — Skyscraper project override and hidden pane.** Its installer now reports actual builtin/user/project priority, repairs pre-existing project-level React copy with backups, preserves unrelated symlinks, and the header/palette navigates to Agent before opening its right panel. It remains a separate repo.
7. **P1 fixed — BFCache replay duplicates existing output.** A restored browser retains the WTerm DOM, so blindly replaying `secretReplay` on `Inspect` appends old output twice. `terminal-replay.ts` now selects the last actually displayed cursor for the same session ID and skips replay; a new native session sends a terminal-only RIS reset before fresh output. Captures are in-memory, contain no bearer token and occur only after the emulator has initialized its screen.
8. **P2 log-only — browser-dependent implementation validation.** Exact installed macOS root, browser Solid compilation, native node-pty and full-screen TUI are not accessible from connected GitHub.
9. **P2 log-only — server lifetime.** Manual PTY still expires at 10 minutes absolute; an Ultimate core restart ends it, and fatal transport errors can terminate manual shells. Extending privileged resource lifetime is a separate decision.

### S6–S8 Plan and work
- Saved plan: `docs/superpowers/plans/2026-11-22-arch-improvement-cycle-7-terminal-usage-skyscraper.md`, written before Cycle 7 code changes.
- Thin modules: `extensions/terminal/auto-start.ts`, `extensions/subscription-usage/navigation.ts` (created just before cycle), existing `shell-launch.ts`/ `lifecycle.ts` retained, not rewritten. Added native status trigger and consistent command navigation.
- Deployment slice: `scripts/install-terminal.sh` preserves `node_modules/node-pty` and modified files; `scripts/install-subscription-usage.sh` preserves SQLite and user settings. Both respect existing project overrides and refuse untrusted symlinks. No GitHub Actions.
- Separate Skyscraper changes are in `bb-plugin-skyscraper` (no duplicated code here).

### S9 Actual evidence and dual circuits
- **Architecture circuit: PASS for source invariants.** Inspected implementation code and host SDK: `@/sdk/solid` exports `showSurface/openPanel`, native `StatusButton` exists, `shellLaunch` still inspects before Open, closes stale Open capability, maintains single PTY and has no new privilege grant or persisted secret. No React facet reintroduced.
- **Behavioral unit/smoke: 18/18 PASS on Node v22** in the current working environment:
  - 7 pure behavior cases: Usage/Skyscraper panel action order, delayed once-only Terminal entry, pagehide vs explicit Stop, BFCache reattach, stale Inspect and stale Open races.
  - 2 Skyscraper installer fixture cases (project-level React precedence, backup and unrelated symlink refusal).
  - 3 Usage/Terminal installer fixture cases (all imported modules, native node-pty and local data preservation, project override).
  - 6 replay-state tests from `test/terminal-replay.test.ts`: retained DOM cursor, new PTY reset, different session history, fresh mount, advanced server base, and pre-render pagehide safety. The actual committed pure source/test blob SHAs match the executed copies.
  - Git blob SHA of tested production `auto-start.ts`, `lifecycle.ts`, `shell-launch.ts`, `errors.ts`, both navigation helpers, `terminal-replay.ts` and installer scripts matched the GitHub versions under review.
- **Product circuit: BLOCKED / NOT RUN.** No actual Ultimate 0.1 Solid frontend build, native macOS node-pty test, renderer screenshot, project-root discovery in the user's running process, or live click/reattach observation. Source tests do **not** mean the installed app is verified. The user's earlier request authorized merging after final architecture review with disclosed runtime residuals.
- Diff gate: compared `main..branch` paths; changes confined to Terminal/Usage UI, tests, safe installers and arch docs. Skyscraper remains in its own repository.

### S10–S12 Lessons / next smoke
- Global buttons must navigate to an actually mounted panel host, not merely change panel state; unit-test order and target, then verify a real click in the live UI.
- Installer coverage is part of the runtime dependency graph. Every new relative import must reach the chosen *installed* extension folder, including project-scoped overrides that shadow the user copy.
- A terminal renderer's lifetime is not a native PTY's lifetime. BFCache state changes need an explicit inspect/attach handshake and stale asynchronous requests must not start or leak duplicate PTYs.
- After installing, verify Usage click from Terminal and Agent, Skyscraper header and palette, Terminal first visit→return→refresh/Stop, inspect PID and 10-minute expiry. If a live macOS/compiled result differs, return to S8 rather than claim success.

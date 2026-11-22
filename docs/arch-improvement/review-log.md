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

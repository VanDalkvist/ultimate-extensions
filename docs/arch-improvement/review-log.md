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

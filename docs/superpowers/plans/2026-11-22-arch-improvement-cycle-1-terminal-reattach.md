# Arch Improvement Cycle 1 — Terminal surface reattachment

Date: 2026-11-22
PR: #4, branch `fix/terminal-reattach-across-surfaces`
Scope: preserve one manually started PTY across Agent ↔ Terminal navigation on macOS and Linux.
Canonical process: `VanDalkvist/arch-improvement-skills/skills/arch-improvement-loop/SKILL.md`.

## S0 / S1 — Bootstrap and memory
- Source of truth: `VanDalkvist/ultimate-extensions`, current PR branch.
- Main and PR HEAD checked via GitHub connector; no local worktree or macOS shell exposed.
- No existing project-local arch-improvement memory/ledger in Git tree.
- Native package: `extensions/terminal`; no CI workflow required for tests.
- Local shell/package installation not accessible; tests cannot be claimed green until executed.

## S2 — Architecture Context Map
- Stage: MVP (explicit, bounded local shell experiment).
- Sources: `extensions/terminal/{README.md,web.tsx,shell-launch.tsx,lifecycle.tsx,server.ts}`,
  `test/{read-ack,permissions}.test.ts`, `test/e2e/owned-pty.test.ts`.
- Baseline: `https://github.com/ai-meatbags/arch-rules/blob/main/arch-rules.md`.
- Critical: AP-016/AP-039/AP-040 (server-side authority); AP-023/AP-032 (async, command/query);
  AP-034 (single-reader ownership, applicable even at MVP as a changed invariant);
  AP-074 (DI, global state); AP-075 (real PTY vertical verification); AP-076 (behavioral assertions).
- Baseline: AP-019 (complexity), AP-051/AP-052 (view versus server state), AP-054 (UI error path).
- Not applicable: DB, queue, migrations, webhooks, Next.js stack.
- Boundaries: Ultimate routes/mounts surface; browser owns viewport; server extension owns PTY and lease;
  `node-pty` owns OS process/TTY. Client cannot authorize PTY access by itself.
- Known pre-existing deviation: `server.ts` uses module-level mutable `session`/`pending`, a critical AP-074 conflict. Remediation requires confirmation of Ultimate's action registration lifecycle; not to be papered over by a fake factory.
- Product contract: manual shell starts only on trusted Start/Open action, is recovered after an internal tab switch, and ends on Stop, real page unload or the absolute 10-minute limit. Agent-owned session rules stay unchanged.

## S3 — Brainstorm/design approval
The user explicitly requested review and edits **inside PR #4**. The approved design is the existing PR goal:
preserve the single server-owned PTY across internal navigation, not create a new persistence service,
multi-session manager, or change production platform process-kill semantics.
Scope of approval covers bounded bug fixes; architecture-wide redesign is out of scope.

## S4 — Source-backed review / S5 — Triage
1. **P1 / fix-now: single-reader contract regression.**
   - `server.ts: actions.read` introduced `s.wake?.(); await Promise.resolve()` on overlapping readers.
   - `test/read-ack.test.ts` explicitly expects concurrent read/ack to be rejected, preserving one reader and unacknowledged output.
   - Impact: new requests could wake/replace another pending reader, causing cursor and lifecycle races (AP-034).
2. **P2 / fix-now: inspect query mutates active reader.**
   - `server.ts: actions.inspect` calls `s.wake?.()` though Inspect is a query.
   - Impact: merely inspecting a shell interrupts an in-flight read (AP-032).
3. **P1 / fix-now: hollow native e2e assertion.**
   - `test/e2e/reattach.test.ts` stops when output *contains* a command literal. Interactive bash echoes input before running it.
   - Impact: the e2e can pass without verifying shell execution (AP-075/AP-076).
4. **P2 / blocked: no runnable product black-box verification.**
   - macOS Ultimate + browser navigation unavailable to this environment; independent S9b PASS cannot be claimed.
5. **P2 / blocked: pre-existing module globals (AP-074).**
   - Module-scope `let session`/`let pending` are shared beyond a host instance. Need Ultimate framework ownership research before extracting an instance-scoped session runtime.
6. **P3 / log-only: large server module.**
   - `server.ts` exceeds AP-019 line budget; avoid blind split without a runnable integration suite.

## S6 — Lean Superpowers plan (bounded vertical slices)

### Slice 1: Restore single-reader invariant on real reattachment
- Boundary: API lifecycle and view reconnect, AP-023/AP-032/AP-034.
- Red test: existing `test/read-ack.test.ts` overlapping reader rejection must be preserved.
- Change: no reader takeover inside `actions.read`, no waking within read-only `actions.inspect`.
  Explicitly hand off stale long-poll from the already authorized `actions.control` resize command
  before the new React view calls Read.
- Assert: active sessionId remains unchanged; no extra PTY starts; rejected concurrent readers do not advance `base`.
- Verify: native read-ack + permissions tests, web shell-launch test, no new auth bypass.
- Stop: any change to permission check, admission identity, agent-owned terminal semantics.

### Slice 2: Replace hollow e2e with observable execution and lifecycle checks
- Boundary: real node-pty test, AP-075/AP-076.
- Red test: reproduction assertion must match an output line that cannot be satisfied by echoed input.
- Assert: command's actual result appears; pid is still alive after simulated 31 seconds; same sessionId and pid on reattach;
  replay contains acknowledged execution output; explicit close kills PTY.
- Verify: `node --experimental-strip-types --test test/e2e/reattach.test.ts` on a compatible host with deps.
- Stop: no daemon changes, no broadened shell lifetime.

### Slice 3: Record review and handoff
- Boundary: docs/arch-improvement; check no secrets were emitted.
- Validate: GitHub PR diff only touches Terminal and cycle docs; compare PR/head to main.
- Product gate: actual macOS+Linux black-box journeys must remain NOT RUN/FAIL until executed.

## S7 — Plan critical review
- Each selected slice preserves the current one-PTY, one-reader architecture and explicit user launch.
- No new server action/transport protocol, no process-killing changes, no semantic expansion beyond navigation.
- Existing tests are behavioral or are strengthened to assert actual output and process lifetime.
- AP-074 remains explicitly blocked; do not claim final Arch Loop PASS.
- **Plan accepted for bounded S8 remediation**, with S9 product gate held open.

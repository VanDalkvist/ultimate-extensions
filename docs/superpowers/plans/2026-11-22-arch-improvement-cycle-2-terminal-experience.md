# Arch Improvement Cycle 2 — Terminal Experience Security, Product and Cross-Platform Review

Date: 2026-11-22
PR: #5, `feat/terminal-find-agent-context` → `main` (Draft)
Canonical process: `VanDalkvist/arch-improvement-skills/skills/arch-improvement-loop/SKILL.md`
Architecture baseline: `ai-meatbags/arch-rules/arch-rules.md`

## S0 — Bootstrap
- GitHub main and PR #5 inspected; PR open and mergeable (no merge requested).
- Changed feature files: `terminal-find.tsx`, `terminal-agent-selection.tsx`, `terminal-agent-context.ts`, `terminal-keybindings.ts`, `web.tsx`, CSS, tests, research.
- No local Ultimate checkout or macOS runtime. Small pure Node tests can run outside Ultimate; native UI tests remain separate.
- Project-local rules: `docs/arch-improvement/{memory,review-log}.md` and Terminal README.
- Do not edit server PTY process/runtime or add GitHub Actions.

## S1 — Memory
- Active lessons: PTY lifetime ≠ viewport lifetime; echoed command text is not an execution oracle; Inspect must not wake reader.
- This cycle is frontend-only and keeps the single server-owned PTY/reader contracts intact.

## S2 — Architecture Context Map
- Stage: MVP; browser Terminal feature over native Ultimate extension actions.
- Architecture: WTerm DOM/React 0.5.10 handles selection/search; Ultimate `api.submit` owns message delivery; native server owns full-access shell/grants and admission.
- Critical AP: AP-012/013 (reject mismatched destination, fail visibly), AP-016/039/040 (don't weaken server access), AP-023 (async/double-submit), AP-025/026 (pinned package contracts), AP-074 (no extra global), AP-076 (behavioral tests).
- Baseline: AP-017 (minimal outgoing data), AP-051/052/054 (feature boundaries, local state, loading/errors), AP-056/057 (deterministic tests).
- N/A: DB, cloud sync, webhooks, model provider selection, OS process cleanup (unchanged).
- Existing module-global `session` in `server.ts` is pre-existing AP-074 debt; explicitly excluded from this client-side PR.

## S3 — Approved scope
The user's directive authorizes security/product/platform review and **bounded fixes in the same PR**, not a new terminal architecture, cloud session manager, or shell permission model. Keep Find and selected-output-to-agent functionality; harden its boundaries.

## S4 — Findings / S5 — Decisions
- **P1 / fix-now:** selected output can be sent to a **different conversation** if active conversation changes while preview is open. `terminal-agent-selection.tsx:send()` uses live `conversation`, not destination at capture time. Confidential logs may leak to unintended chat (AP-013, AP-017).
- **P1 / fix-now:** shell-output prompt injection can spoof ad-hoc `--- End selected terminal output ---` delimiter in `terminal-agent-context.ts`. Untrusted text cannot be given authority by framing. Escape as a single JSON string literal, label it as untrusted, and test delimiter attacks and control characters (AP-016/017).
- **P1 / fix-now:** unrelated grant/revoke network failure in `web.tsx` calls `failed()` and terminates the manual shell. PTY must remain alive; refresh authoritative `Inspect` state and show honest uncertainty (AP-012/023).
- **P2 / fix-now:** a failed `api.submit` may have been accepted by the server; display "delivery not confirmed, check conversation before retry", not a definite rejection. Guard double-click sends synchronously (AP-023/054).
- **P2 / fix-now:** high-risk `Allow agent` label is ambiguous next to harmless `To agent` (access grant vs text sharing). Name full shell-control privilege clearly (AP-016/054).
- **P2 / fix-now:** Find opens with stale query but does not select it when input was unmounted; toolbar close loses terminal focus; Escape handling only exists inside input (AP-054).
- **P2 / fix-now:** keybinding logic captures macOS Command+F and Linux Ctrl+Shift+F on both platforms, and contenteditable descendants are not excluded. Separate per-platform behavior and typing contexts (AP-051/054).
- **P2 / fix-now:** anchor-based Find popover may overflow horizontally in narrow viewport even with a viewport-sized width. Add a safe narrow-viewport layout; record actual mobile visual verification as pending (AP-054).
- **P2 / blocked:** no real compiled browser runtime / macOS PTY and Linux host here; cannot award S9b PASS.
- **P3 / log-only:** duplicated frontend display state and large `web.tsx` are prior design debt. No speculative refactor.

## S6 — Superpowers Lean Implementation Plan

### Slice 1 — Secure explicit agent-submission transaction
- Boundary: terminal selection → verified local preview → Ultimate conversation API.
- AP: AP-012/013/016/017/023/076.
- Red tests: changed active conversation **rejects submission**; delimiter-attack text remains a JSON value; control characters cannot create extra unquoted lines; max UTF-8 bytes enforced; failed delivery remains ambiguous.
- Implementation: preview stores `{text, conversation}` and never silently re-targets; pure preparation function validates destination and produces safe data-only message; UI previews and confirms; sync in-flight lock prevents duplicate sends.
- Verify: `node --experimental-strip-types --test test/agent-context.test.ts` using local helper source; source review of API call destination.
- Stop: cannot add any shell execution, automatic data collection, grant, log or persistence.

### Slice 2 — Preserve PTY on grant/revoke failure, disambiguate actions
- Boundary: browser grant/revoke action to authoritative server.
- AP: AP-012/016/023/054.
- Red assertion: failure must never invoke `terminalViewLifecycle.failed` / `closeShell`; when possible reconcile grant state through read-only `Inspect`.
- Implementation: use explicit access-action errors; never terminate PTY on a grant network error; label grant as full shell control, not context sharing.
- Verify: review wiring from Grant/Revoke/Inspect through native action authorization.

### Slice 3 — Cross-platform Find/selection UX
- Boundary: keyboard focus, WTerm search, responsive layout.
- AP: AP-025/051/054/076.
- Red tests: `meta+f` only macOS, `ctrl+shift+f` only other desktop platforms; Ctrl+F preserved for shell; no interception in editor/inputs; correct reopen/close behavior.
- Implementation: pure platform-aware shortcut matcher, editable target scope; focus/select with mounted ref; close with shell focus; viewport-safe popover CSS.
- Verify: `node --experimental-strip-types --test test/keybindings.test.ts` and pinned WTerm v0.5.10 source contract.

### Slice 4 — Traceability
- Append Cycle 2 to `docs/arch-improvement/review-log.md` and durable lessons to `memory.md`.
- Update PR #5 details, never claim black-box acceptance without actual Ultimate runtime.

## S7 — Plan Review
- Fixes are bounded inside existing Terminal feature; no protocol, OS, model or multi-session migration. Walking skeleton requirement AP-075 does not require a new subsystem in this slice.
- Core PTY permissions remain server authoritative, and the existing Open/Close lifecycle is not touched.
- Only a user-approved send can cross the Ultimate chat boundary. The frontend cannot promise prevention of every prompt-injection attempt: the model must still treat the output as untrusted.
- Verification includes pure behavioral tests and static contract review; assembled macOS/Linux product verification remains explicitly blocked.
- Plan is sound for bounded S8, but not a claim of S9 dual-circuit PASS.

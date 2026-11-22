# Arch Improvement Loop — Cycle 8: restore Terminal/Usage behavior after Solid sync

Date: 2026-11-22. Repository: `VanDalkvist/ultimate-extensions`.
Base: `main@f6546e9944d0b95e8f38066f565f11b0951d15a6`.
Branch: `fix/arch-loop-8-restore-terminal-usage-20261122`.
Previous validated source: `614200b1bf94ba28c4157f4b3cce3a0c81cb0b6d` (merged Cycle 7).

## S0–S2: bootstrap, memory and architecture orientation

Canonical orchestrator: `VanDalkvist/arch-improvement-skills/skills/arch-improvement-loop/SKILL.md`.
Loaded existing `docs/arch-improvement/{memory,review-log}.md` and Cycle 7 plan. This environment has connected GitHub but not the user's running macOS Ultimate or node-pty and cannot claim a product black-box PASS.

The boundaries are independent: browser Solid facade, server extension lifecycle, native PTY, user/project-discovered extension copies and install-time scripts. Skyscraper remains solely in `VanDalkvist/bb-plugin-skyscraper`. Changes to its Godot game and Draft PR #1 are excluded.

## S3–S5: decision, review and triage

User requested completion of the stalled repair via Arch Loop and previously approved restoring Terminal auto-start/re-attach, BFCache and Usage panel navigation.

**P1 fix-now:** the immediately subsequent commit `f6546e9` replaced functional Cycle 7 source with a simplified upstream snapshot. Verified direct source diff:
- `subscription-usage/server.ts` reintroduced `host.onRelease` (removed Ultimate 0.1 API); `web.solid.tsx` now only invokes `openPanel`, invisible on Terminal/Files.
- `terminal/web.solid.tsx` lost one-visit auto-start, BFCache snapshot/replay and native shell picker; `lifecycle.solid.tsx` closes manually started sessions on implicit leave; `server.ts` once again hardcodes `/bin/bash`, losing macOS shell discovery/process cleanup.
- Regression tests and supporting modules were deleted; `scripts/install-{terminal,subscription-usage}.sh` still require removed module names, making both installers fail prior to copying anything.

**P2 fix-now:** preserve independent newer changes to Files/sidebar-resize and add a cheap local contract gate to prevent future silent cross-extension rollback.

**Blocked:** real installed macOS compiled UI, node-pty smoke, current winning user/project directory; cannot be verified from connected GitHub. Explicit 10-minute PTY deadline and core-restart teardown are intentional limits, not fix-now.

## S6: Lean execution plan

1. [ ] **Red test / contract:** demonstrate that current `f6546e9` violates required behavior and installer dependency closure (source + tests). Capture exact failed assertions, not a test-receipt.
2. [ ] **Restore bounded known-good slices:** restore **only** `extensions/terminal/**` and `extensions/subscription-usage/**` from merged `614200b`, including the tests and lockfile, as Git blob-identical files. Keep Files, VPN, sidebar-resize, top-level README and all other areas unchanged.
3. [ ] **Guard future sync:** add a repository-local Node 22+ source contract test, runnable without GitHub Actions, asserting provider lifecycle, visible-panel navigation, terminal auto-start + BFCache + shell detection, all relative imports and installer required files.
4. [ ] **S9 architectural circuit:** inspect Git compare (restored vs known-good blob SHA), local contract gate, original recorded 18/18 behavior tests, installer closure, core authorization untouched relative to pre-regression; do not claim re-execution of inaccessible native suite.
5. [ ] **S9 product circuit:** document as BLOCKED unless real compiled macOS UI + shell + Usage status + Skyscraper integration actually run.
6. [ ] **S10/S11:** append precise source and product verification state to review ledger and a memory lesson; merge the bounded PR only with previous user authorization and explicit remaining product gate. Delete temporary branch after merge; don't merge unrelated Skyscraper game PR.

## S7: critical plan review

Targeted restoration is safer than reconstructing 20+ deleted security and PTY modules by hand. Commit `f6546e9` also modified Files and sidebar resize; do not revert it wholesale. Do not invent or silently downgrade the current browser SDK. All restored files were already part of main in Cycle 7, but that is not proof they work in the user's locally installed host. Preserve SQLite, native node-pty, game data, install backups and local extensions. No automatic Actions; the guard is a repeatable local Node command. If host compile incompatibility is established, stop and report rather than pretend to pass S9.

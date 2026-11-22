# Arch Improvement Loop — Cycle 7: Ultimate panels, terminal persistence, extension discovery

Date: 2026-11-22. Scope: user-reported active Ultimate 0.1 errors, follow-up to prior Cycles 5–6.

## S0 Bootstrap / S1 Memory / S2 Orientation

- Repo: `VanDalkvist/ultimate-extensions`; base `main` at `7b52f2b`, work branch `fix/terminal-usage-arch-loop-20261122`. A **different repo**, `VanDalkvist/bb-plugin-skyscraper`, remains the sole home of Skyscraper.
- Skills: `VanDalkvist/arch-improvement-skills/skills/arch-improvement-loop/SKILL.md`, Ultimate `extensions/README.md`, `docs/extensions/slots.md`, `web/src/app/shell.solid.tsx` and `lib/discovery.ts`.
- Memory: avoid React↔Solid SDK assumptions; trust actual host contracts; reattachment must not change read/ack ownership; test real behavior rather than receipt-only assertions; local installed extension copies are distinct from GitHub; no auto GitHub Actions.
- Architecture map:
  - Usage `statusline.left` is global; `Panels` only mounts on Agent and other selected surfaces. `openPanel(id)` only records desired panel and region; it does **not** navigate to a surface containing `Panels`. TooltipTrigger render props must be merged into a native button rather than lost.
  - Terminal view (`web.solid.tsx`) mounts only when the corresponding surface is active. `shellLaunch` inspects and reattaches server PTY before optionally opening. `lifecycle` currently closes user-owned PTY on `pagehide`; native server itself caps session at 10 minutes absolute.
  - Skyscraper lives in `bb-plugin-skyscraper`; Ultimate discovers extensions in order builtin → user → project (later takes precedence). Actual active `web.tsx` error proves a winning discovered directory **lacks** `web.solid.tsx` even when the source repository contains it. Installer currently only synchronizes the user directory.

## S3 Brainstorm / user decision

User explicitly requested fixing Usage, Skyscraper, Terminal together via the full Arch Improvement Loop after repeated broken deliveries. Product decision: a visit to the Terminal surface is a deliberate intent to start the shell, without a second Start click; attach to an existing PTY first; preserve the PTY across surface switches and refresh, bounded by existing expiration policy. Usage should show its details on an actual panel-bearing surface. Skyscraper must remain external.

## S4 Findings / S5 triage

1. **P1 fix-now Usage**: global status strip click updates right-panel state on screens without `Panels`; previous attempted fix not verified end-to-end. Use host supported `StatusButton`, `showSurface('agent')` followed by `openPanel('subscription-usage')`; assert ordering and panel ID. Confirm native trigger render semantics.
2. **P1 fix-now Usage deployment**: the installer does not include the newly created `navigation.ts`; a user installing from it gets an unresolved import. Assert dependency closure; copy all required sources, not an accidental short list.
3. **P1 fix-now Terminal start**: cold Terminal mounts inspect but leaves `Ready · start explicitly`; add a *once-per-visit* gate after WTerm is ready and installed shell validated, forwarding through the existing `shellLaunch.request()` (which inspects before open). Never open on extension load, hidden surface or invalid shell; no duplication during races.
4. **P1 fix-now Terminal persistence**: on browser `pagehide`, old view explicitly closes user PTY; change to detach only, preserving bounded server TTL. Explicit Stop, fatal transport failure and server core shutdown must still close. No unbounded shell lifetime or token persistence.
5. **P1 fix-now Skyscraper installation**: stale winning project-level folder shadows upgraded user-level folder. Add discovery-aware install/diagnostic in `bb-plugin-skyscraper`, print precedence and source of the active facet, and safely update *only* known extension files in user/project locations using backups, respecting symlinks and repo isolation. Never blindly wipe project data.
6. **P2 log-only**: hard 10-minute absolute PTY lifetime remains; changes to resource policy need explicit approval and native tests. Core process restart always kills PTY. Real system stdout/UI verification unavailable from GitHub-only environment.

## S6 Lean plan (test-first slices)

- [ ] Slice 0 / AP-075 walking skeleton: assert actual Ultimate extension discovery priority (`builtin,user,project`) and the installed facet path classification. A locally executable diagnosis must identify exactly why a project override would load React.
- [ ] Slice 1 Usage: add pure functional test for navigating status click to Agent then right panel, and a deployment-manifest test for all relative Usage web imports. Fix `web.solid.tsx`/installer as needed, including any already-present project-scoped Usage override (same winner-precedence rule as Skyscraper).
- [ ] Slice 2 Terminal: add red/green unit tests for once-per-visit auto-start and reattachment without duplicated open; update `web.solid.tsx` wiring. Add red/green lifecycle test for `pagehide` detach and explicit Stop close.
- [ ] Slice 3 Skyscraper: test discovery and install as read-only dry-run over fake dirs (including project override, symlinks and obsolete `web.tsx`); safely update its own repository's installer only. Avoid touching the game server.
- [ ] Slice 3B Terminal deployment: add backup-preserving sync for the *installed* Terminal Solid/TS source files without replacing native `node_modules` or any session data; test a fake installed copy. Otherwise a GitHub fix still runs stale code locally.
- [ ] S9 Architectural circuit: source diff, all relative imports in changed facets, server auth/PTY lifecycle invariants, no React fallback or stray server privilege changes.
- [ ] S9 Product circuit: behavioral tests for status → panel, Terminal enter/remount/reload/stop, Skyscraper active facet detected; document **real installed macOS UI/PTY runs as NOT RUN** unless executed.
- [ ] S10/S11 append markdown ledger and lessons after implementation; add install/restart acceptance commands; no auto GitHub Actions.

## S7 Critical plan review

- No hidden shell spawning while extension merely loads: Terminal component only mounts when that surface is shown; WTerm readiness and validated shell are prerequisites. Reattach is attempted by `shellLaunch` before open.
- A browser navigation/reload must not silently grant an agent shell; any auto-start is **user-owned**, behind the existing server guard. Explicit grants and approvals unchanged.
- Do not change the server 10-minute cap without owner approval; fully persistent shells would otherwise introduce long-lived OS privileges.
- Do not pretend an updated Git checkout modifies a different active project extension override. Script must reveal exact winning path and back up only known facet files.
- Gate S9 remains blocked until an actual Ultimate macOS build/browser/PTY smoke test is run. Existing user authorization covers source fixes, not fabricated verification.

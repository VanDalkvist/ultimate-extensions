# Arch Improvement Cycle 5 — Ultimate 0.1 obsolete React facets

Date: 2026-11-22. Scope: live user screenshot with Files, Skyscraper, Subscription Usage showing `React facets were removed in 0.1`; recent Terminal Solid 2 failure due to unsupported SDK export.

## S0–S2: memory, orientation, context map
- Source of truth: Ultimate upstream `skills/solid-ui/SKILL.md` and `extensions/README.md`. `web.tsx` is legacy and loads an error card, `web.solid.tsx` is the supported facet. Solid 2 SDK is `@/sdk/solid`; UI kit `@/components/ui/*.solid.tsx`; icons `@lucide/solid`.
- Prior cycle learning: never claim source-level checks equal compiled UI; never mix React SDK hooks with Solid; no automatic GitHub workflows; test critical user journeys.
- Repositories: `ultimate-extensions` (files, subscription-usage, right-panel-resize, terminal), `bb-plugin-skyscraper` (game panel, external repo). Installed `~/.ultimate/extensions` is a local copy; GitHub commits do not automatically install there.
- Architecture boundaries: React old view → Solid new view; native servers of files and usage are unchanged. Files has file autosave, conflict detection and Tiptap, which require lossless migration or separate safely blocked sub-slice.
- The Terminal ActionError export has already been patched on main, but independent SDK API and build review must continue.

## S3 Design decision
User explicitly diagnosed three broken extensions and asked if Solid migration is needed. Select incremental cross-repository repairs with separately reviewed changes. Preserve existing product workflows instead of renaming old React sources.

## S4 Findings / S5 Triage
1. **P0 fix-now:** `files/web.tsx`, `subscription-usage/web.tsx`, `bb-plugin-skyscraper/extension/web.tsx` are entirely unavailable on Ultimate 0.1.
2. **P1 fix-now:** `right-panel-resize/web.tsx` remains next to `web.solid.tsx`, which can trigger the removed-React-facet error even though its Solid facet exists.
3. **P1 fix-now:** previous Terminal merge imported missing `ActionError` from `@/sdk/solid`; main now has local `readActionFailure`; review other actual SDK export names.
4. **P1 guarded:** Files has source editing, Tiptap rich editor, autosave and conflict/reload protection. Blind renaming or replacing with a toy textarea risks data loss; must retain unchanged server file action contract and tests.
5. **P2 blocked:** installed macOS Ultimate is unavailable, full Solid 2 compilation and actual screenshot interaction must remain explicit post-install gates.

## S6 Lean plan (checklist)
- [ ] **Slice 0 walking skeleton:** small Skyscraper Solid facet, correct Solid panel/header command SDK contracts, keep iframe and explicit refresh. Unit/contract review; no game runtime change. Separate PR in `bb-plugin-skyscraper`.
- [ ] **Slice 1** remove obsolete `right-panel-resize/web.tsx` only after confirming `web.solid.tsx` is a complete registered facet.
- [ ] **Slice 2** migrate `subscription-usage/web.tsx` to `web.solid.tsx`, preserving status chip, pinning, per-provider panel, refresh actions, same server contract; no React dependency.
- [ ] **Slice 3** migrate Files with architecture-preserving model/controller: pure buffers remain; Solid useFiles session with cleanup and autosave, native Tiptap editor in Solid, safe Markdown preview, tree, tabs, confirm dialogs, externally requested file open. Do not touch server or weaken dirty/conflict semantics; if not adequately testable, leave Files as blocked and do not merge an untested downgrade.
- [ ] **Slice 4** audit Terminal post-ActionError SDK symbols and retry contract; add findings/test if needed.
- [ ] **S9** run available pure tests and static contract probes; real browser/host tests must be marked NOT RUN, not PASS. Do not silently merge user-facing unverified Files migration.
- [ ] **S10–S11** update ledger/memory with limitations and link PRs.

## S7 Review
- No rename-only migration.
- No installation into local macOS via cloud GitHub commits. User must sync installed extensions.
- No React bridge inside Solid 2.
- Every new registration must use actual upstream SDK exports and host contract.
- End-user's request is to diagnose/migrate unavailable extensions, not to change game mechanics or server-side file security.

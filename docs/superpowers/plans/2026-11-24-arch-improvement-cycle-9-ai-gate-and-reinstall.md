# Arch Improvement Loop — Cycle 9: AI Gate safety and whole-repo extension reinstall

Date: 2026-11-24.
Repository: `VanDalkvist/ultimate-extensions`.
Base: current `main`; candidate: `feat/ai-traffic-gate` (Draft PR #11).
Stage: `prod` — extensions are installed in a live Ultimate host; Terminal has native OS process privileges and Usage reads existing provider credentials.

## S0–S2: Bootstrap, memory and architecture context

Canonical orchestrator: `VanDalkvist/arch-improvement-skills/skills/arch-improvement-loop/SKILL.md`.
Loaded:
- `docs/arch-improvement/memory.md` and `docs/arch-improvement/review-log.md`.
- Root `README.md`, VPN `AGENTS.md`, extension-specific READMEs, existing install scripts and regression admission test.
- Public baseline `https://github.com/ai-meatbags/arch-rules/blob/main/arch-rules.md` (no project-pinned copy is present).

Existing lessons applied:
- Git source and installed copies are separate state; project-scoped copies can shadow global copies.
- Installation must preserve SQLite, browser drafts, terminal PTY/native dependencies, credentials, and local edits.
- A deploy sync must include the complete import dependency closure and the VPN Git submodule.
- Static/source checks do not prove a live compiled Ultimate or native macOS PTY path.

### Architecture Context Map

- Stage: `prod` (operational local environment; Terminal shell has user-level OS privileges).
- Source docs: root README, per-extension READMEs, VPN AGENTS.md, memory and review ledger, current Draft PR #11.
- Active paths: six extension folders: `files`, `right-panel-resize`, `subscription-usage`, `terminal`, `themes`, `vpn`; global `~/.ultimate/extensions`; optional project `.ultimate/extensions`.
- Critical gates: AP-011 boundaries/cohesion; AP-012 explicit failures; AP-013 user data integrity; AP-016 authoritative boundary; AP-020 composition root; AP-021 thin entry points; AP-022 typed/observable failures; AP-023 awaited async; AP-025 import discipline; AP-026 stable contracts; AP-027 fail-fast configuration; AP-032 command/query separation; AP-042 secret handling; AP-043 safe file handling; AP-074 explicit DI; AP-075 walking skeleton; AP-076 behavioral assertion integrity.
- Baseline gates: AP-019 meaningful module size; AP-028 deterministic tests.
- Not applicable: database schema/transaction rules for this cycle; no database storage migration is planned. The Usage SQLite file is an invariant to preserve.
- Known deviations: candidate AI Gate PR exists before this cycle's written plan and has not been run through the user's Ultimate/macOS runtime. This cycle treats it as an existing review candidate and records the procedural deviation; new cycle fixes follow this plan.
- Verification surface: Node tests; Bash syntax; isolated temporary filesystem install/rollback fixtures; Mihomo config validation on the user's actual machine remains a runtime gate.
- Open decisions: preserve already-linked VPN source symlinks; update only existing project-scoped overrides; require explicit opt-in for reinstalling native Terminal dependencies; do not expose credentials or database/session data in backups outside the intended extension folders.

## S3: Approved design

User requested:
1. Architecture review of the current AI-Gate changes using this loop.
2. One script to reinstall every extension from this repository.
3. An explicit way to roll back if the new version breaks the host.

Implementation decisions:
- One collection installer with `--dry-run` as the default, explicit `--apply`, `--list-backups` and `--rollback <backup-id>`.
- Always refresh the user-level extension set. An optional `--project-root <path>` refreshes only extension overrides already present in that project; absent project overrides are not created.
- Before any replacement, validate all six source folders, the VPN submodule and all destination types/symlinks.
- Stage every source copy before swapping. Create one timestamped backup outside Ultimate's extension discovery tree. Existing extension directories are moved into that backup; failed swaps are restored automatically.
- Preserve `files/node_modules` link, Terminal's native `node_modules`, and already-linked extension directories. Never touch Usage SQLite, browser sessionStorage, Pi auth, project files or the running Mihomo daemon.
- Native dependency installation is a separate explicit option; it is not silently run during a source reinstall.
- Add behavioral filesystem tests for dry-run, full deploy, project override precedence, symlink refusal/preservation, data/dependency preservation, and rollback.
- Harden AI Gate's config rewrite so the AI rule wins over existing routing rules, config validation targets the actual configured file, and rollback restores both config and rule file (including the case where no prior rule file existed).
- Split AI route nodes from the general PROXY selector: AI-NODES inherits only the configured subscription providers, excludes static proxies such as the user's cleartext HTTP `shopproxy`, and uses `empty-fallback: REJECT`.
- Make UI status indicators require Mihomo `rule` mode as well as the matching selector state; a legacy/direct mode must never be presented as a protected state.

## S6–S7: Planned vertical slices and review gates

### Slice 0 — Whole-extension installer walking skeleton
- Boundary: shell CLI -> staged filesystem deployment -> installed extension.
- AP gates: AP-013, AP-021, AP-023, AP-043, AP-075, AP-076.
- Red test first: run the real script against a temporary HOME/repository with six minimal extension fixtures; assert actual copied files and source hashes, untouched external data, backup contents and restored destination after `--rollback`.
- Implementation: staging, complete preflight, backup manifest, atomic per-directory swap and rollback.
- Stop condition: any target outside the explicitly selected extension directories would be changed, a symlink destination is ambiguous, or a source folder is incomplete.

### Slice 1 — AI Gate installer safety
- Boundary: Mihomo YAML/file boundary and reload command.
- AP gates: AP-012, AP-013, AP-016, AP-027, AP-032, AP-042, AP-043.
- Red test first: fake Mihomo/yq/curl tools in a temporary directory; assert AI rule priority, config path validation, rule-file backup/restore, and no partial config after a failed validation/reload.
- Implementation: fail-fast preconditions, collision detection, actual-config validation, safe write/rename, and exact rollback of prior file state.
- Stop condition: config path cannot be validated without guessing or another group's/provider's semantics would be overwritten.

### Slice 2 — AI protection status contract
- Boundary: VPN read-model/presentation contract.
- AP gates: AP-012, AP-016, AP-026, AP-032, AP-076.
- Red test first: a snapshot with AI selector=PROXY and global mode=direct must render the AI gate as unprotected; in rule mode the same selection must render protected.
- Implementation: explicit derived gate status and truthful panel states.
- Stop condition: UI labels claim protection from selector state alone.

### Slice 3 — collection installer coverage
- Boundary: repo source inventory -> global/project installed copies.
- AP gates: AP-011, AP-013, AP-025, AP-027, AP-028, AP-043.
- Red test first: all six current extension paths and their required special assets/dependencies are enumerated.
- Implementation: test source completeness, special dependency preservation, optional dependency rebuild and user-facing instructions.
- Stop condition: any native dependency or local state would be silently deleted/replaced.

### S9 — Dual verification
- Architecture circuit: four mandatory semantic probes, source diff, entry-point tracing, installer failure recovery, secret/data preservation.
- Product circuit: execute Happy Path, empty/cold-start and error/rollback journeys through the real shell script and temporary filesystem.
- Actual macOS Ultimate UI, Mihomo TUN, native PTY and the user's project override remain explicitly NOT RUN unless accessible and observed.

### Exclusions
- No PF/system kill switch work in this cycle.
- No unrelated extension feature refactors.
- No automatic GitHub Actions or remote deployment.
- No automatic Terminal `npm ci` / node-gyp build unless explicitly requested with an installer flag.
- No merging PR #11 or changing `main` without a separate user decision.

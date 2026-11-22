# Arch Improvement Memory — Ultimate Extensions

## 2026-11-22 — PTY lifecycle is not viewport lifecycle
- Context: Terminal reattachment across Ultimate's Agent and Terminal surfaces (PR #4).
- Symptom: React unmount called `leave()` and closed the manually launched PTY; remounting initially only accepted agent-owned PTYs.
- Cause: shell lifetime and React view lifetime were coupled; existing short server lease assumed a constantly polling viewport.
- Use next time: distinguish physical PTY lifetime, view attachment, and the single-reader transport. Keep Start/Stop/security enforcement server-owned; navigation must not create a second process. Write tests for both owner types, tab switch and page unload.
- Evidence: `extensions/terminal/{lifecycle.tsx,shell-launch.tsx,server.ts}`, `test/web/lifecycle.test.tsx`, `test/web/shell-launch.test.tsx`.

## 2026-11-22 — Never use an echoed command as an execution oracle
- Context: Native node-pty E2E test for reattachment.
- Symptom: `output.includes('REATTACH_TEST_42')` could succeed on interactive shell input echo before the command executed.
- Cause: assertion checked a substring of the input, not the functional output.
- Use next time: select a result-only, anchored stdout marker, and assert the real side effect (PTY PID/session identity, liveness, explicit termination). This applies to other terminal and agent-tool smoke tests.
- Evidence: `extensions/terminal/test/e2e/reattach.test.ts`, AP-075/AP-076.

## 2026-11-22 — Inspection should not be the reader-handoff command
- Context: new view attempted to take over a pending long-poll.
- Symptom: `inspect()` woke the old reader, while a modified `read()` changed the previous one-reader rejection contract.
- Cause: hidden mutation in a query and implicit concurrency handoff.
- Use next time: preserve exclusive read and acknowledgement semantics; handoff through an already authorized command and verify prior waiting poll is drained. Check the pre-existing concurrency tests before altering the API.
- Evidence: `extensions/terminal/server.ts`, `test/read-ack.test.ts`, AP-023/AP-032/AP-034.


## 2026-11-22 — Terminal output to agent must bind data and destination
- Context: PR #5, manual terminal selection → reviewed preview → agent follow-up.
- Symptom: switching conversations during preview would silently retarget private logs; static delimiters in the user message could be spoofed by shell output.
- Cause: recipient was read from live UI state on Send; untrusted output was interpolated raw into a marker-based prompt.
- Use next time: store the destination ID with the captured preview, compare it again before submitting, frame untrusted content as a single quoted data value, and test delimiter/control-byte attacks. These are defense-in-depth, not a substitute for agent-side trust boundaries or explicit user review.
- Evidence: \`extensions/terminal/terminal-agent-context.ts\`, \`terminal-agent-selection.tsx\`, \`test/agent-context.test.ts\`.

## 2026-11-22 — Access-command failure must not terminate the unrelated PTY
- Context: PR #5 grant/revoke controls for an existing shell.
- Symptom: frontend grant/revoke \`catch\` invoked terminal transport \`failed()\` and stopped the manually launched shell despite the command's outcome being uncertain.
- Cause: a non-fatal permission-control failure was conflated with a fatal native read/control failure.
- Use next time: keep access-control errors separate from PTY lifetime; use server-authoritative read-only Inspect to reconcile ambiguous responses, and report uncertainty instead of automatic retries.
- Evidence: \`extensions/terminal/web.tsx\` Grant/Revoke/Inspect call path.

## 2026-11-22 — Browser shortcut must win before terminal input, only on target OS
- Context: WTerm Find controls in Ultimate, macOS/Linux.
- Symptom: global bubble-phase handler could lose the race to the emulator's input handler; controls accepted both Mac and non-Mac keys on every OS.
- Cause: shortcut handling ignored event dispatch order and platform-specific readline semantics.
- Use next time: capture a bounded key combination at window capture phase, exclude editable/dialog descendants via composedPath, and derive the browser platform (with UA fallback). Test Mac/Windows/Linux separately and keep Bash Ctrl+F.
- Evidence: \`extensions/terminal/{terminal-find.tsx,terminal-keybindings.ts}\`, \`test/keybindings.test.ts\`.

## 2026-11-22 — User extensions can sit outside Tailwind source scanning
- Context: Ultimate user-installed Terminal subcomponents.
- Symptom: layout-critical new classes could be missing when extensions live under \`$HOME/.ultimate/extensions\`, while narrow panels let right-aligned popovers leave the viewport.
- Cause: host Tailwind \`@source\` includes repo extensions, not necessarily personal extension directories.
- Use next time: use project-owned stylesheet fallbacks for structural layout and built-in Ultimate theme variables; test nested narrow panel widths, not only viewport breakpoints.
- Evidence: \`extensions/terminal/web.css\`, \`terminal-find.tsx\`, upstream \`web/src/index.css\`.


## 2026-11-22 — Persistent shell selection crosses two trust boundaries
- Context: PR #6, native Zsh/Bash/Fish discovery and browser preference in an older React-based Ultimate extension.
- Symptom: hardcoded Bash ignored the account login shell; a cached arbitrary path or missing shell could be selected; a newer SDK advertised settings only through its Solid hook.
- Cause: confusion between host login-shell configuration, client-preference storage, and server privilege boundary; framework SDK expectations drift across versions.
- Use next time: discover read-only from bounded OS sources, persist only a path (never session or terminal secrets), verify again before privileged PTY spawn, and keep React/other framework compatibility explicit.
- Additionally: validate a one-shot approval's dependencies before consuming that approval; an invalid saved preference must not discard the request.
- Evidence: `extensions/terminal/{shells.ts,shell-preference-store.ts,shell-preference.ts,server.ts}`; `test/{shells.test.ts,shell-preference.test.ts,permissions.test.ts}`.


## 2026-11-22 — A UI framework migration must include the entire extension facet
- Context: Ultimate removed React compat: \`web.tsx\` was no longer loaded as a normal extension, even if the native \`server.ts\` and PTY actions worked.
- Symptom: isolated React components, React-only hook assumptions, and \`@wterm/react\` dependencies contradicted the live Solid 2 SDK.
- Remedy: register exactly one \`web.solid.tsx\`, use \`@/sdk/solid\` readers as accessors, use \`onSettled\` for WTerm DOM create/destroy and host event cleanup, use \`@lucide/solid\`, and prefer the host's durable \`useExtensionUiState\` to an ad hoc localStorage fallback.
- Migration requires old facet deletion, package/lock pruning, and updating pure \`.tsx\` helpers/tests to \`.ts\`; preserving imports by accident may compile only under an obsolete host.
- Verification discipline: source-level architecture invariants and pure Node tests are **not** full Solid/PTY integration or proof of visual quality; do not claim black-box product PASS without launching the host.
- Evidence: \`extensions/terminal/web.solid.tsx\`, \`terminal-emulator.solid.tsx\`, \`terminal-controls.solid.tsx\`, \`test/web\`, \`package-lock.json\`.

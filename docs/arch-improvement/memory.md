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

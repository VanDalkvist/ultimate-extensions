Provider subscription usage in the status line, with a panel for the per-provider breakdown.

The status line shows each provider's remaining quota the way the provider reports it — for example `Codex 91% wk`,
`Claude 95% 5h`, `Go 90%` — refreshed while Ultimate runs. The chip opens a panel with the same numbers per window.

![Subscription usage in the status line](../../docs/usage.png)

## What it reads

It reads the usage the provider exposes for the credentials Ultimate already has, from Pi's shared auth in
`~/.pi/agent`. It adds no login of its own and sends nothing anywhere else; with no credentials for a provider, that
provider simply does not appear.

## Install

From the repository root, run:

```sh
bash scripts/install-subscription-usage.sh "${PWD}"
```

The installer copies every top-level Solid and TypeScript dependency, including `navigation.ts`, into the user extension and any already-present project-scoped override. Run it from the directory where Ultimate starts (or pass that project root as its argument). Changed files are backed up. It disables the obsolete installed React `web.tsx` by renaming it, and **does not touch** `~/.ultimate/subscription-usage.sqlite`, browser state or credentials. A plain `git pull` or `cp -r` alone can leave stale files in `~/.ultimate/extensions/subscription-usage/`.

## Ultimate 0.1

The UI uses `web.solid.tsx` and the native Solid 2 SDK. It provides the same
bottom status-line chip and subscription-usage panel; server providers, local
cache and network requests are unchanged. An installed React `web.tsx` is rejected only if the **winning discovered extension directory** has no `web.solid.tsx`. Ultimate prefers Solid when both files exist in the same directory, but a project-level React copy can override a user-level Solid copy. The installer updates both known locations and backs up old React files. No GitHub Actions are required.

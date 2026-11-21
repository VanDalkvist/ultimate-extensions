Provider subscription usage in the status line, with a panel for the per-provider breakdown.

The status line shows each provider's remaining quota the way the provider reports it — for example `Codex 91% wk`,
`Claude 95% 5h`, `Go 90%` — refreshed while Ultimate runs. The chip opens a panel with the same numbers per window.

![Subscription usage in the status line](../../docs/usage.png)

## What it reads

It reads the usage the provider exposes for the credentials Ultimate already has, from Pi's shared auth in
`~/.pi/agent`. It adds no login of its own and sends nothing anywhere else; with no credentials for a provider, that
provider simply does not appear.

## Install

```sh
mkdir -p "$HOME/.ultimate/extensions"
cp -r extensions/subscription-usage "$HOME/.ultimate/extensions/"
```

Nothing else to install.

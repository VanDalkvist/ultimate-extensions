Choose Ultimate’s default palette or Obsidian Minimal without changing light or dark mode.

Use **Choose a color theme** in the command palette. Select **Default** to remove all overrides immediately. The project’s root conversation stores the choice in `themes.selection`, so tabs and reloads share it. Ultimate’s existing **Toggle light and dark theme** command still controls the mode per browser.

| Action           | Arguments | Result                                                 |
| ---------------- | --------- | ------------------------------------------------------ |
| `themes/list`    | `null`    | Available `{ id, label }` pairs                        |
| `themes/current` | `null`    | Effective `{ id }`                                     |
| `themes/apply`   | `{ id }`  | Selected `{ id }`; rejects unknown ids without writing |
| `themes/reset`   | `null`    | `{ id: 'default' }`                                    |

Add a built-in by placing its data under `builtin/` and registering it in `registry.ts`. The stylesheet accepts only known color tokens with hex or numeric HSL values. Unset tokens inherit Ultimate’s own CSS. No theme assets are fetched at runtime.

Minimal uses the default color scheme from [Obsidian Minimal 9.1.4](https://github.com/kepano/obsidian-minimal/blob/9.1.4/theme.css), by Steph Ango, under the [MIT license](https://github.com/kepano/obsidian-minimal/blob/9.1.4/LICENSE). It does not include Obsidian layouts or alternate Minimal color schemes. Fonts remain Ultimate’s: Minimal delegates font choices to Obsidian, and Ultimate’s named font utilities inline their stacks rather than reading theme overrides.

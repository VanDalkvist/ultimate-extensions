import standard from './builtin/default.ts'
import minimal from './builtin/minimal.ts'

const colors = new Set([
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
  'brand',
  'brand-foreground',
  'success',
  'warning',
  'note',
  'error',
  'diff-add',
  'diff-del',
  'terminal',
  'sidebar',
  'sidebar-foreground',
  'sidebar-border',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-ring',
] as const)
type Color = typeof colors extends ReadonlySet<infer T> ? T : never

type Tokens = Partial<Record<Color, string>>
export type Theme = { id: string; label: string; light: Tokens; dark: Tokens }
export const themes: readonly Theme[] = [standard, minimal]
export const defaultTheme = standard.id
export const selectionKind = 'themes.selection'
export const findTheme = (id: unknown) => themes.find((theme) => theme.id === id)

const colorValue = /^(?:#[\da-f]{6}|hsl\(\d{1,3} \d{1,3}% \d{1,3}%(?: \/ 0\.\d+)?\))$/i

function rule(selector: string, tokens: Tokens) {
  const declarations = Object.entries(tokens).flatMap(([key, value]) => {
    return colors.has(key as Color) && colorValue.test(value) ? [`--${key}:${value};`] : []
  })
  return declarations.length ? `${selector}{${declarations.join('')}}` : ''
}

export function themeCss(id: unknown) {
  const theme = findTheme(id)
  if (!theme) return ''
  return rule(':root:not(.dark)', theme.light) + rule(':root.dark', theme.dark)
}

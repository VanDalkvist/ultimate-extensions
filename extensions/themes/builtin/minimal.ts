import type { Theme } from '../registry.ts'

/**
 * Default scheme from Obsidian Minimal 9.1.4 by Steph Ango (MIT):
 * https://github.com/kepano/obsidian-minimal/blob/9.1.4/theme.css
 * Primary uses Minimal's accent with its dark ink instead of white so button labels stay readable.
 * Ultimate's brand, terminal, and status/diff colors have no like-for-like Minimal tokens.
 * Minimal defers interface, prose, and monospace fonts to Obsidian, so this port keeps Ultimate's fonts.
 */
export default {
  id: 'minimal',
  label: 'Obsidian Minimal',
  light: {
    background: '#ffffff',
    foreground: '#0f0f0f',
    card: '#f5f5f5',
    popover: '#ffffff',
    sidebar: '#f5f5f5',
    primary: 'hsl(201 17% 56%)',
    'primary-foreground': '#0f0f0f',
    secondary: '#e6e6e6',
    muted: '#f5f5f5',
    'muted-foreground': '#757575',
    accent: 'hsl(0 0% 46% / 0.12)',
    destructive: '#d04255',
    border: '#e6e6e6',
    input: '#d6d6d6',
    ring: 'hsl(201 17% 42%)',
  },
  dark: {
    background: '#262626',
    foreground: '#d1d1d1',
    card: '#212121',
    popover: '#262626',
    sidebar: '#212121',
    primary: 'hsl(201 17% 55%)',
    'primary-foreground': '#0f0f0f',
    secondary: '#363636',
    muted: '#212121',
    'muted-foreground': '#999999',
    accent: 'hsl(0 0% 55% / 0.12)',
    destructive: '#d04255',
    border: '#363636',
    input: '#454545',
    ring: 'hsl(201 17% 68%)',
  },
} satisfies Theme

import type { AmzSiteConfig } from '@/site-layouts/amz-template-2/defaultSiteConfig'

/**
 * Build CSS variables from merged AMZ config (replaces static import of site.config in amz-template-1).
 */
export function generateThemeCSS(config: AmzSiteConfig): string {
  const { colors } = config.theme

  const lightVars = `
  --background: ${colors.light.background};
  --foreground: ${colors.light.foreground};
  --card: ${colors.light.card};
  --card-foreground: ${colors.light.foreground};
  --popover: ${colors.light.card};
  --popover-foreground: ${colors.light.foreground};
  --primary: ${colors.light.primary};
  --primary-foreground: oklch(0.99 0 0);
  --secondary: ${colors.light.secondary};
  --secondary-foreground: oklch(0.99 0 0);
  --muted: ${colors.light.muted};
  --muted-foreground: ${colors.light.mutedForeground};
  --accent: ${colors.light.accent};
  --accent-foreground: oklch(0.99 0 0);
  --border: ${colors.light.border};
  --input: ${colors.light.input};
  --ring: ${colors.light.primary};
  `

  const darkVars = `
  --background: ${colors.dark.background};
  --foreground: ${colors.dark.foreground};
  --card: ${colors.dark.card};
  --card-foreground: ${colors.dark.foreground};
  --popover: ${colors.dark.card};
  --popover-foreground: ${colors.dark.foreground};
  --primary: ${colors.dark.primary};
  --primary-foreground: oklch(0.99 0 0);
  --secondary: oklch(0.35 0.02 240);
  --secondary-foreground: ${colors.dark.foreground};
  --muted: ${colors.dark.muted};
  --muted-foreground: ${colors.dark.mutedForeground};
  --accent: ${colors.light.accent};
  --accent-foreground: ${colors.dark.background};
  --border: ${colors.dark.border};
  --input: ${colors.dark.input};
  --ring: ${colors.dark.primary};
  `

  return `
    :root {
      ${lightVars}
    }

    .dark {
      ${darkVars}
    }
  `
}

export function generateFontCSS(config: AmzSiteConfig): string {
  const { fonts } = config
  return `
    :root {
      --font-sans: "${fonts.sans}", system-ui, -apple-system, sans-serif;
      --font-mono: "${fonts.mono}", monospace;
    }
  `
}

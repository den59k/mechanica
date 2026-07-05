/**
 * Multi-language (i18n) helpers — pure, DOM-free path math shared by the dev
 * server, the runtime and the static export. A logical page has one canonical
 * path (`/about`); each non-default locale is served under a `/<code>` prefix
 * (`/ru/about`). The default locale is always unprefixed.
 */

/** The site's locale configuration (from the plugin's `locales` option). */
export interface LocalesConfig {
  /** The default locale code — served at unprefixed URLs. */
  default: string
  /** Every locale the site publishes, the default included. */
  all: string[]
  /** Optional human labels for the editor UI, keyed by code (`{ ru: 'Русский' }`). */
  labels?: Record<string, string>
}

/** A raw `locales` plugin option: the full config or a bare list of codes. */
export type LocalesOption = LocalesConfig | string[] | undefined

/**
 * Normalize a raw `locales` option into a config, or `null` when i18n is off:
 * the option is omitted/empty, or it resolves to a single locale (nothing to
 * prefix or translate). The default is forced into `all`; duplicates drop.
 */
export function normalizeLocales(option: LocalesOption): LocalesConfig | null {
  if (!option) return null
  const raw = Array.isArray(option) ? { default: option[0] ?? '', all: option } : option
  const all = raw.all.filter((code, i) => !!code && raw.all.indexOf(code) === i)
  const fallbackDefault = raw.default || all[0] || ''
  if (!fallbackDefault) return null
  if (!all.includes(fallbackDefault)) all.unshift(fallbackDefault)
  // A single-locale site needs no prefixing or variants.
  if (all.length < 2) return null
  return { default: fallbackDefault, all, labels: (raw as LocalesConfig).labels }
}

/** Whether `code` is a locale this config knows about. */
export function isLocale(config: LocalesConfig | null | undefined, code: string): boolean {
  return !!config && config.all.includes(code)
}

/**
 * Split a URL path into its locale and logical path. A leading `/<code>`
 * segment naming a non-default locale is stripped; everything else stays as-is
 * under the default locale.
 *
 *   parseLocalePath('/ru/blog', cfg) → { locale: 'ru', path: '/blog' }
 *   parseLocalePath('/blog', cfg)    → { locale: 'en', path: '/blog' }   // en = default
 *   parseLocalePath('/ru', cfg)      → { locale: 'ru', path: '/' }
 */
export function parseLocalePath(
  urlPath: string,
  config: LocalesConfig | null | undefined,
): { locale: string; path: string } {
  if (!config) return { locale: '', path: urlPath }
  const match = urlPath.match(/^\/([^/]+)(\/.*)?$/)
  const head = match?.[1]
  if (head && head !== config.default && config.all.includes(head)) {
    return { locale: head, path: match![2] || '/' }
  }
  return { locale: config.default, path: urlPath }
}

/**
 * Prefix a logical path for a locale. The default locale (or no config, or an
 * unknown code) returns the path unchanged; other locales get a `/<code>`
 * prefix.
 *
 *   localePath('/blog', 'ru', cfg) → '/ru/blog'
 *   localePath('/', 'ru', cfg)     → '/ru'
 *   localePath('/blog', 'en', cfg) → '/blog'   // en = default
 */
export function localePath(
  path: string,
  locale: string | undefined,
  config: LocalesConfig | null | undefined,
): string {
  if (!config || !locale || locale === config.default) return path
  if (!config.all.includes(locale)) return path
  const clean = path === '/' ? '' : path
  return `/${locale}${clean}`
}

/** The human label for a locale — the config's `labels`, else the code itself. */
export function localeLabel(config: LocalesConfig | null | undefined, code: string): string {
  return config?.labels?.[code] ?? code
}

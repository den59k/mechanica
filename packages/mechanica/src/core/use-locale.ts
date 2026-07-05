import { computed, inject, type ComputedRef } from 'vue'
import { localePath as buildLocalePath, type LocalesConfig } from 'mechanica-shared'
import { mechanicaKey } from './state'

/** What {@link useLocale} exposes to blocks — the current locale + path helpers. */
export interface UseLocale {
  /** The locale the current page renders in (the default when i18n is off). */
  locale: ComputedRef<string>
  /** The locales this logical page has a translation for (a language switcher's list). */
  locales: ComputedRef<string[]>
  /** The full site locale config, or null when i18n is off. */
  config: LocalesConfig | null
  /** Whether the site is multi-language. */
  enabled: boolean
  /**
   * Prefix a logical path for a locale (defaults to the current one). Use it to
   * build language-switcher links: `localePath(page.path, 'ru')` → `/ru/about`.
   */
  localePath(path: string, locale?: string): string
}

/**
 * Access the current locale and language helpers inside a block. On a
 * single-language site `locale` is the empty string, `locales` is empty and
 * `localePath` is the identity — so language-switcher blocks render nothing
 * and internal links stay unprefixed.
 */
export function useLocale(): UseLocale {
  const ctx = inject(mechanicaKey, null)
  const config = ctx?.locales ?? null
  const locale = computed(() => ctx?.page?.locale ?? config?.default ?? '')
  const locales = computed(() => ctx?.page?.locales ?? config?.all ?? [])
  return {
    locale,
    locales,
    config,
    enabled: !!config,
    localePath: (path, target) => buildLocalePath(path, target ?? locale.value, config),
  }
}

import {
  hasToolsCardTranslation,
  registerToolsCardTranslation,
  type ToolsCardTranslation,
} from "./strings";

export const TOOLS_CARD_LOCALES = [
  "en-gb",
  "de",
  "es",
  "fr",
  "nl",
  "zh-hans",
] as const;

export type ToolsCardLocale = typeof TOOLS_CARD_LOCALES[number];

type LocaleModule = {
  default?: ToolsCardTranslation;
};

type LocaleImporter = (url: string, locale: ToolsCardLocale) => Promise<LocaleModule>;
type LocaleUrlBuilder = (locale: ToolsCardLocale) => string;

const SUPPORTED_LOCALES = new Set<string>(TOOLS_CARD_LOCALES);
const LOCALE_ALIASES: Record<string, ToolsCardLocale> = {
  "zh": "zh-hans",
  "zh-cn": "zh-hans",
  "zh-sg": "zh-hans",
};

function normalizeLanguage(language: unknown): string {
  return String(language || "en").trim().toLowerCase().replaceAll("_", "-");
}

/**
 * Resolve a Home Assistant language to one of our emitted locale modules.
 * `null` means the built-in English catalogue or an unsupported language.
 */
export function resolveToolsCardLocale(language: unknown): ToolsCardLocale | null {
  const normalized = normalizeLanguage(language);
  const alias = LOCALE_ALIASES[normalized];
  if (alias) return alias;
  if (SUPPORTED_LOCALES.has(normalized)) return normalized as ToolsCardLocale;

  const base = normalized.split("-")[0];
  if (base === "en") return null;
  return SUPPORTED_LOCALES.has(base) ? base as ToolsCardLocale : null;
}

function defaultLocaleUrl(locale: ToolsCardLocale): string {
  const moduleUrl = new URL(import.meta.url, window.location.href);
  const localeUrl = new URL(`./tools-card-locales/${locale}.js`, moduleUrl);
  const version = moduleUrl.searchParams.get("v");
  if (version) localeUrl.searchParams.set("v", version);
  return localeUrl.toString();
}

async function defaultLocaleImporter(url: string): Promise<LocaleModule> {
  // A computed URL deliberately keeps these standalone modules out of the
  // tools-card bundle. They are emitted separately by build-tools-card.mjs.
  return import(url);
}

/**
 * Shared, session-scoped loader. Successful and failed outcomes are retained
 * so multiple card instances neither duplicate requests nor retry on every
 * Home Assistant state update.
 */
export class ToolsCardLocaleLoader {
  private readonly _promises = new Map<ToolsCardLocale, Promise<boolean>>();
  private readonly _outcomes = new Map<ToolsCardLocale, "loaded" | "failed">();

  constructor(
    private readonly _importLocale: LocaleImporter = defaultLocaleImporter,
    private readonly _localeUrl: LocaleUrlBuilder = defaultLocaleUrl,
  ) {}

  needsLoad(language: unknown): boolean {
    const locale = resolveToolsCardLocale(language);
    return Boolean(
      locale
      && !hasToolsCardTranslation(locale)
      && !this._outcomes.has(locale),
    );
  }

  async ensure(language: unknown): Promise<boolean> {
    const locale = resolveToolsCardLocale(language);
    if (!locale) return true;
    if (hasToolsCardTranslation(locale)) {
      this._outcomes.set(locale, "loaded");
      return true;
    }

    const outcome = this._outcomes.get(locale);
    if (outcome) return outcome === "loaded";

    const existing = this._promises.get(locale);
    if (existing) return existing;

    const url = this._localeUrl(locale);
    const pending = this._importLocale(url, locale)
      .then((module) => {
        const translation = module?.default;
        if (!translation || typeof translation !== "object") {
          throw new Error(`Locale module ${locale} has no default translation export`);
        }
        registerToolsCardTranslation(locale, translation);
        this._outcomes.set(locale, "loaded");
        return true;
      })
      .catch((error) => {
        this._outcomes.set(locale, "failed");
        console.warn(
          `[Sofabaton Control Panel] Failed to load locale "${locale}" from ${url}; using English.`,
          error,
        );
        return false;
      })
      .finally(() => {
        this._promises.delete(locale);
      });

    this._promises.set(locale, pending);
    return pending;
  }
}

export const toolsCardLocaleLoader = new ToolsCardLocaleLoader();

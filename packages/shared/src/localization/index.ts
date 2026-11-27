import { en, LOCALES, type Locale } from "./en";

const CATALOGUES: Record<Locale, Record<string, string>> = { en };

export type TranslationVars = Record<string, string | number | boolean | null | undefined>;

export type Translator = (key: string, vars?: TranslationVars) => string;

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export function translate(key: string, vars?: TranslationVars, locale: Locale = "en"): string {
  const catalogue = CATALOGUES[locale] ?? en;
  const template = catalogue[key] ?? en[key] ?? key;
  return interpolate(template, vars);
}

export function createTranslator(locale: Locale = "en"): Translator {
  return (key, vars) => translate(key, vars, locale);
}

export function hasTranslation(key: string, locale: Locale = "en"): boolean {
  return Boolean((CATALOGUES[locale] ?? en)[key] ?? en[key]);
}

export function translationKeys(): string[] {
  return Object.keys(en);
}

export { en, LOCALES };
export type { Locale };

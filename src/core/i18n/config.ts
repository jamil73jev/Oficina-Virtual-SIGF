export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Etiqueta BCP 47 completa usada por Intl para cada idioma. */
export const intlTags: Record<Locale, string> = { es: "es-EC", en: "en-US" };

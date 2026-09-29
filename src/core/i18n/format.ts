import { intlTags, type Locale } from "./config";

export function formatDate(
  value: Date | number | string,
  locale: Locale,
  timeZone = "UTC",
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  return new Intl.DateTimeFormat(intlTags[locale], {
    ...options,
    timeZone,
  }).format(new Date(value));
}

export function formatCurrency(
  amount: number,
  locale: Locale,
  currency = "USD",
): string {
  return new Intl.NumberFormat(intlTags[locale], {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlTags[locale]).format(value);
}

/** Nombre corto del huso horario (p. ej. "GMT-5") en el idioma dado. */
export function formatTimeZone(
  timeZone: string,
  locale: Locale,
  at: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat(intlTags[locale], {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

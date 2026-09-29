/** Formatea el tiempo restante hasta `expiraEn` (unidad mayor, redondeo hacia abajo). */
export function formatearRestante(
  expiraEn: Date | string,
  ahora: number,
  localeTag: string,
): { texto: string; vencida: boolean } {
  const ms = new Date(expiraEn).getTime() - ahora;
  if (!Number.isFinite(ms) || ms <= 0) return { texto: "", vencida: true };
  const s = Math.floor(ms / 1000);
  const [valor, unit] =
    s >= 86400
      ? [Math.floor(s / 86400), "day"]
      : s >= 3600
        ? [Math.floor(s / 3600), "hour"]
        : s >= 60
          ? [Math.floor(s / 60), "minute"]
          : [Math.max(s, 1), "second"];
  const texto = new Intl.NumberFormat(localeTag, {
    style: "unit",
    unit,
    unitDisplay: "long",
  }).format(valor as number);
  return { texto, vencida: false };
}

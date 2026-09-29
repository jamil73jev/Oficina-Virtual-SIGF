const MAX_SALIDA = 8000;

const PATRONES_INYECCION = [
  /ignor[ae]\b.{0,40}\b(instrucciones|instructions|prompt)/i,
  /ignore\b.{0,40}\b(previous|prior|above)/i,
  /(system|sistema)\s*prompt/i,
  /you are now|ahora eres/i,
  /(borra|elimina|delete|drop)\b.{0,30}\b(todo|all|database|base de datos)/i,
];

/** Escapa un valor para usarlo dentro de un atributo entre comillas dobles. */
export function escaparAtributo(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

export function pareceInyeccion(texto: string): boolean {
  return PATRONES_INYECCION.some((p) => p.test(texto));
}

/**
 * Las salidas de herramientas son DATOS no confiables: se serializan, se acotan y se
 * encierran en un sobre inerte. Nunca se interpretan como instrucciones ni amplian permisos.
 */
export function envolverDatoNoConfiable(herramienta: string, salida: unknown) {
  const bruto = typeof salida === "string" ? salida : (JSON.stringify(salida) ?? "null");
  const acotado = bruto.length > MAX_SALIDA ? `${bruto.slice(0, MAX_SALIDA)}...[truncado]` : bruto;
  // Insensible a mayusculas y espacios: no se puede cerrar el sobre con </DATOS_HERRAMIENTA >.
  const neutro = acotado.replace(/<\s*\/\s*datos_herramienta/gi, "<\\/datos_herramienta");
  const nombre = escaparAtributo(herramienta);
  return {
    sospechosa: pareceInyeccion(acotado),
    texto:
      `<datos_herramienta nombre="${nombre}" confiable="false">\n` +
      `${neutro}\n</datos_herramienta>`,
  };
}

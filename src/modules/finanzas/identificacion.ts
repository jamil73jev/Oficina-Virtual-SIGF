import type { TipoIdentificacion } from "./domain";

/** Quita espacios y guiones; la comparacion de duplicados usa esta forma. */
export function normalizarIdentificacion(identificacion: string): string {
  return identificacion.replace(/[\s-]/g, "").toUpperCase();
}

function digitos(valor: string): number[] {
  return valor.split("").map(Number);
}

function provinciaValida(valor: string): boolean {
  const provincia = Number(valor.slice(0, 2));
  return (provincia >= 1 && provincia <= 24) || provincia === 30;
}

/** Digito verificador modulo 10 de la cedula ecuatoriana (coeficientes 2,1,2,1...). */
export function digitoVerificadorCedula(nueveDigitos: string): number {
  const suma = digitos(nueveDigitos).reduce((acc, d, i) => {
    const producto = d * (i % 2 === 0 ? 2 : 1);
    return acc + (producto > 9 ? producto - 9 : producto);
  }, 0);
  return (10 - (suma % 10)) % 10;
}

function modulo11(base: string, coeficientes: number[]): number {
  const suma = digitos(base).reduce((acc, d, i) => acc + d * (coeficientes[i] ?? 0), 0);
  const resto = suma % 11;
  return resto === 0 ? 0 : 11 - resto;
}

export function cedulaValida(valor: string): boolean {
  if (!/^\d{10}$/.test(valor) || !provinciaValida(valor)) return false;
  if (Number(valor[2]) >= 6) return false;
  return digitoVerificadorCedula(valor.slice(0, 9)) === Number(valor[9]);
}

export function rucValido(valor: string): boolean {
  if (!/^\d{13}$/.test(valor) || !provinciaValida(valor)) return false;
  const tercero = Number(valor[2]);
  if (tercero < 6) return cedulaValida(valor.slice(0, 10)) && valor.slice(10) !== "000";
  if (tercero === 6) {
    // Entidad publica: verificador en la posicion 9 y establecimiento de 4 digitos.
    const verificador = modulo11(valor.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2]);
    return verificador !== 10 && verificador === Number(valor[8]) && valor.slice(9) !== "0000";
  }
  if (tercero === 9) {
    const verificador = modulo11(valor.slice(0, 9), [4, 3, 2, 7, 6, 5, 4, 3, 2]);
    return verificador !== 10 && verificador === Number(valor[9]) && valor.slice(10) !== "000";
  }
  return false;
}

/** `null` cuando el tipo no tiene regla verificable (tipo `otro`: pasaporte, extranjero...). */
export function identificacionValida(tipo: TipoIdentificacion, identificacion: string): boolean | null {
  const valor = normalizarIdentificacion(identificacion);
  if (tipo === "cedula") return cedulaValida(valor);
  if (tipo === "ruc") return rucValido(valor);
  return valor.length > 0 ? null : false;
}

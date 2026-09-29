/** Generador pseudoaleatorio determinista (mulberry32): misma semilla, misma secuencia. */
export class Aleatorio {
  private estado: number;

  constructor(semilla: number | string) {
    this.estado = typeof semilla === "number" ? semilla >>> 0 : hashTexto(semilla);
  }

  /** Numero en [0, 1). */
  siguiente(): number {
    this.estado = (this.estado + 0x6d2b79f5) >>> 0;
    let t = this.estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entero en [min, max], ambos incluidos. */
  entero(min: number, max: number): number {
    return min + Math.floor(this.siguiente() * (max - min + 1));
  }

  probabilidad(p: number): boolean {
    return this.siguiente() < p;
  }

  elegir<T>(opciones: readonly T[]): T {
    const elegido = opciones[this.entero(0, opciones.length - 1)];
    if (elegido === undefined) throw new Error("Aleatorio.elegir: lista vacia");
    return elegido;
  }
}

/** FNV-1a de 32 bits, para aceptar semillas de texto. */
function hashTexto(texto: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

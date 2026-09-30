import type { Membresia, MembresiasRepo } from "./membresias";

/**
 * Repo de membresias de produccion: Drizzle sobre obtenerBaseDatos(). Se carga de forma
 * PEREZOSA (import dinamico en la primera consulta) para que importar la autenticacion no
 * abra conexiones ni arrastre el driver de Postgres a donde no hace falta.
 */
class MembresiasPerezosasRepo implements MembresiasRepo {
  private repo: Promise<MembresiasRepo> | undefined;

  private cargar(): Promise<MembresiasRepo> {
    this.repo ??= (async () => {
      const [{ obtenerBaseDatos }, { MembresiasDrizzleRepo }] = await Promise.all([
        import("@/core/db/cliente"),
        import("./membresias-drizzle"),
      ]);
      return new MembresiasDrizzleRepo(obtenerBaseDatos());
    })();
    // Si la carga falla (p. ej. falta DATABASE_URL) se reintenta en la siguiente peticion.
    this.repo.catch(() => {
      this.repo = undefined;
    });
    return this.repo;
  }

  async listarPorUsuario(usuarioId: string): Promise<Membresia[]> {
    return (await this.cargar()).listarPorUsuario(usuarioId);
  }
}

const CLAVE = Symbol.for("oficina-virtual.membresiasRepo");

export function obtenerMembresiasRepo(): MembresiasRepo {
  const g = globalThis as unknown as Record<symbol, MembresiasRepo>;
  g[CLAVE] ??= new MembresiasPerezosasRepo();
  return g[CLAVE];
}

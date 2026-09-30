import { asc, eq } from "drizzle-orm";
import type { BaseDatos } from "@/core/db";
import { membresia, usuario } from "@/core/db/schema";
import type { Membresia, MembresiasRepo } from "./membresias";

/**
 * Membresias en Postgres (tablas usuario y membresia). Recibe la BaseDatos inyectada; el
 * cableado a obtenerBaseDatos() lo hace la fabrica (fabrica.ts), de forma perezosa.
 * El JOIN con usuario exige que el usuario exista en el catalogo (alta explicita).
 */
export class MembresiasDrizzleRepo implements MembresiasRepo {
  constructor(private readonly db: BaseDatos) {}

  async listarPorUsuario(usuarioId: string): Promise<Membresia[]> {
    const filas = await this.db
      .select({ usuarioId: membresia.usuarioId, orgId: membresia.orgId, rol: membresia.rol })
      .from(membresia)
      .innerJoin(usuario, eq(usuario.id, membresia.usuarioId))
      .where(eq(membresia.usuarioId, usuarioId))
      .orderBy(asc(membresia.orgId));
    return filas.map((f) => ({ usuarioId: f.usuarioId, orgId: f.orgId, rol: f.rol }));
  }
}

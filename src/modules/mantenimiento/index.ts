import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { BaseDatos } from "@/core/db";
import { obtenerBaseDatos } from "@/core/db/cliente";
import { purgarEventosAntiguos } from "@/orchestration/traza/postgres";

/**
 * Tarea diaria de mantenimiento (Vercel Cron, plan Hobby: una vez al dia).
 *  1. Una consulta trivial a la base: cuenta como actividad y evita que Supabase Free pause el
 *     proyecto tras una semana sin uso.
 *  2. Retencion: borra los eventos de traza de mas de 30 dias (500 MB de base en el plan gratis).
 * Vercel envia `Authorization: Bearer <CRON_SECRET>` cuando la variable existe; sin ese secreto
 * (o si es corto) la ruta responde 401 siempre. Nunca se devuelve el mensaje de un error interno.
 */

const json = (cuerpo: unknown, status: number) =>
  Response.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });

export function secretoValido(recibido: string | null, secreto: string | undefined): boolean {
  if (!secreto || secreto.length < 16 || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface DepsMantenimiento {
  env?: Record<string, string | undefined>;
  db?: () => BaseDatos;
  purgar?: (db: BaseDatos) => Promise<number>;
}

export function crearManejadorMantenimiento({
  env = process.env,
  db = obtenerBaseDatos,
  purgar = (b) => purgarEventosAntiguos(b),
}: DepsMantenimiento = {}) {
  return async (req: Request): Promise<Response> => {
    if (!secretoValido(req.headers.get("authorization"), env.CRON_SECRET)) {
      return json({ error: "no_autorizado" }, 401);
    }
    try {
      const base = db();
      await base.execute(sql`select 1`);
      const eventosPurgados = await purgar(base);
      return json({ ok: true, eventosPurgados }, 200);
    } catch {
      return json({ error: "mantenimiento_fallido" }, 503);
    }
  };
}

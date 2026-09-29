import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { redactar, type Auditor } from "@/core/audit";
import { can, type ContextoAcceso } from "@/core/rbac";
import type { Riesgo } from "@/types";
import type { AprobacionRegistro, AprobacionesRepo } from "./repo";

export type NivelRiesgo = z.infer<typeof Riesgo>;
export type DecisionAprobacion = "aprobada" | "rechazada";

/** Lo que el orquestador envia al pedir una aprobacion. */
export interface PayloadSolicitud {
  orgId: string;
  ejecucionId: string;
  tipo: string;
  datos: Record<string, unknown>;
}

export type CodigoErrorAprobacion =
  | "no_encontrada"
  | "rol_insuficiente"
  | "ya_decidida"
  | "expirada"
  | "solicitud_invalida";

export class AprobacionError extends Error {
  constructor(readonly codigo: CodigoErrorAprobacion) {
    super(`Aprobacion: ${codigo}`);
    this.name = "AprobacionError";
  }
}

export interface OpcionesServicio {
  ahora?: () => Date;
  nuevoId?: () => string;
}

export const ACTOR_SISTEMA = "sistema";

/** Una aprobacion expirada equivale a rechazo (fail-closed). */
export const esRechazo = (a: Pick<AprobacionRegistro, "estado">): boolean =>
  a.estado === "rechazada" || a.estado === "expirada";

export class ServicioAprobaciones {
  private readonly ahora: () => Date;
  private readonly nuevoId: () => string;

  constructor(
    private readonly repo: AprobacionesRepo,
    private readonly auditor: Auditor,
    opciones: OpcionesServicio = {},
  ) {
    this.ahora = opciones.ahora ?? (() => new Date());
    this.nuevoId = opciones.nuevoId ?? randomUUID;
  }

  async solicitar(
    payload: PayloadSolicitud,
    riesgo: NivelRiesgo,
    expiraEn: Date,
  ): Promise<AprobacionRegistro> {
    if (
      !payload.orgId ||
      !payload.ejecucionId ||
      !payload.tipo ||
      Number.isNaN(expiraEn.getTime()) ||
      expiraEn.getTime() <= this.ahora().getTime()
    ) {
      throw new AprobacionError("solicitud_invalida");
    }
    const registro: AprobacionRegistro = {
      id: this.nuevoId(),
      orgId: payload.orgId,
      ejecucionId: payload.ejecucionId,
      tipo: payload.tipo,
      payload: redactar(payload.datos),
      riesgo,
      estado: "pendiente",
      decididoPor: null,
      decididoEn: null,
      expiraEn,
    };
    await this.repo.crear(registro);
    await this.auditor.anexar({
      orgId: registro.orgId,
      actor: ACTOR_SISTEMA,
      accion: "aprobacion:solicitar",
      entidad: `aprobacion:${registro.id}`,
      antes: null,
      despues: registro,
    });
    return registro;
  }

  async decidir(
    id: string,
    decision: DecisionAprobacion,
    usuario: ContextoAcceso,
  ): Promise<AprobacionRegistro> {
    if (!can(usuario.rol, "aprobacion:decidir")) {
      await this.auditarDenegacion(usuario, "aprobacion:decision_denegada", `aprobacion:${id}`, {
        decision,
      });
      throw new AprobacionError("rol_insuficiente");
    }
    // Busqueda acotada a la org del usuario: otra org equivale a no encontrada.
    const actual = await this.repo.obtener(usuario.orgId, id);
    if (!actual) throw new AprobacionError("no_encontrada");

    await this.expirarSiVencida(actual);

    // Decision + auditoria: la intencion se audita ANTES de mutar. Si la auditoria
    // falla, no se decide nada (fail-closed). Si falla la entrada final, la
    // intencion queda como rastro compensatorio de una decision sin cierre.
    await this.auditor.anexar({
      orgId: usuario.orgId,
      actor: usuario.usuarioId,
      accion: "aprobacion:decision_iniciada",
      entidad: `aprobacion:${id}`,
      despues: { decision },
    });
    const resuelta = await this.repo.resolverSiPendiente(usuario.orgId, id, {
      estado: decision,
      decididoPor: usuario.usuarioId,
      decididoEn: this.ahora(),
    });
    if (!resuelta) {
      const fresca = await this.repo.obtener(usuario.orgId, id);
      throw new AprobacionError(
        fresca?.estado === "expirada" ? "expirada" : "ya_decidida",
      );
    }
    try {
      await this.auditor.anexar({
        orgId: usuario.orgId,
        actor: usuario.usuarioId,
        accion:
          decision === "aprobada" ? "aprobacion:aprobar" : "aprobacion:rechazar",
        entidad: `aprobacion:${id}`,
        antes: { estado: "pendiente" },
        despues: resuelta,
      });
    } catch (e) {
      // La decision ya se aplico: se intenta dejar constancia; el error se propaga.
      await this.auditor
        .anexar({
          orgId: usuario.orgId,
          actor: ACTOR_SISTEMA,
          accion: "aprobacion:auditoria_incompleta",
          entidad: `aprobacion:${id}`,
          despues: { decision, estado: resuelta.estado },
        })
        .catch(() => undefined);
      throw e;
    }
    return resuelta;
  }

  /** Audita un acceso denegado (403) por rol insuficiente. */
  async auditarDenegacion(
    usuario: ContextoAcceso,
    accion: string,
    entidad: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.auditor.anexar({
      orgId: usuario.orgId,
      actor: usuario.usuarioId,
      accion,
      entidad,
      despues: { ...extra, motivo: "rol_insuficiente", rol: usuario.rol },
    });
  }

  /** Pendientes vigentes de la org; las vencidas pasan antes a "expirada". */
  async listarPendientes(orgId: string): Promise<AprobacionRegistro[]> {
    const todas = await this.repo.listar(orgId);
    const vigentes: AprobacionRegistro[] = [];
    for (const a of todas) {
      if (a.estado !== "pendiente") continue;
      if (await this.expirarSiVencida(a)) continue;
      vigentes.push(a);
    }
    return vigentes.sort((x, y) => x.expiraEn.getTime() - y.expiraEn.getTime());
  }

  /** Consulta puntual (aplica expiracion). Null si no existe en la org. */
  async obtener(orgId: string, id: string): Promise<AprobacionRegistro | null> {
    const a = await this.repo.obtener(orgId, id);
    if (!a) return null;
    await this.expirarSiVencida(a);
    return this.repo.obtener(orgId, id);
  }

  /** Devuelve true si estaba vencida (y la marca como expirada: rechazo). */
  private async expirarSiVencida(a: AprobacionRegistro): Promise<boolean> {
    const ahora = this.ahora();
    if (a.estado !== "pendiente" || a.expiraEn.getTime() > ahora.getTime())
      return false;
    const r = await this.repo.resolverSiPendiente(a.orgId, a.id, {
      estado: "expirada",
      decididoPor: null,
      decididoEn: ahora,
    });
    if (r) {
      await this.auditor.anexar({
        orgId: a.orgId,
        actor: ACTOR_SISTEMA,
        accion: "aprobacion:expirar",
        entidad: `aprobacion:${a.id}`,
        antes: { estado: "pendiente" },
        despues: r,
      });
    }
    return true;
  }
}

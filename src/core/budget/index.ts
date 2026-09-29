import { randomUUID } from "node:crypto";
import type { Auditor } from "@/core/audit";
import { exigir, type ContextoAcceso } from "@/core/rbac";
import {
  reservar,
  type AmbitoGuard,
  type EstadoPresupuesto,
  type Uso,
} from "@/orchestration/runtime";

/** Identifica un presupuesto: para el ambito org, refId es el propio orgId. */
export interface ClavePresupuesto {
  ambito: AmbitoGuard;
  refId: string;
}

export interface SolicitudAmpliacion {
  id: string;
  orgId: string;
  tipo: "ampliacion_presupuesto";
  claves: ClavePresupuesto[];
  estimado: Uso;
  estado: "pendiente" | "aprobada" | "rechazada";
  decididoPor: string | null;
  creadaEn: string;
}

/** Operaciones dentro de una transaccion; toda lectura/escritura lleva orgId. */
export interface TxPresupuesto {
  obtener(
    orgId: string,
    clave: ClavePresupuesto,
  ): Promise<EstadoPresupuesto | null>;
  guardar(
    orgId: string,
    clave: ClavePresupuesto,
    estado: EstadoPresupuesto,
  ): Promise<void>;
  pendientePara(
    orgId: string,
    claves: ClavePresupuesto[],
  ): Promise<SolicitudAmpliacion | null>;
  crearSolicitud(s: SolicitudAmpliacion): Promise<void>;
  obtenerSolicitud(
    orgId: string,
    id: string,
  ): Promise<SolicitudAmpliacion | null>;
  guardarSolicitud(s: SolicitudAmpliacion): Promise<void>;
}

export interface PresupuestoRepo {
  /** Ejecuta `fn` de forma atomica y serializada (en BD: transaccion con bloqueo de fila). */
  transaccion<T>(fn: (tx: TxPresupuesto) => Promise<T>): Promise<T>;
}

const k = (orgId: string, c: ClavePresupuesto) =>
  `${orgId}|${c.ambito}|${c.refId}`;
const clonar = <T>(v: T): T => structuredClone(v);

export class PresupuestoMemoriaRepo implements PresupuestoRepo {
  private presupuestos = new Map<string, EstadoPresupuesto>();
  private solicitudes = new Map<string, SolicitudAmpliacion>();
  private cola: Promise<unknown> = Promise.resolve();

  /** Siembra un presupuesto (pruebas / arranque). */
  definir(
    orgId: string,
    clave: ClavePresupuesto,
    estado: EstadoPresupuesto,
  ): void {
    this.presupuestos.set(k(orgId, clave), clonar(estado));
  }

  leer(orgId: string, clave: ClavePresupuesto): EstadoPresupuesto | null {
    const e = this.presupuestos.get(k(orgId, clave));
    return e ? clonar(e) : null;
  }

  solicitudesDe(orgId: string): SolicitudAmpliacion[] {
    return [...this.solicitudes.values()]
      .filter((s) => s.orgId === orgId)
      .map(clonar);
  }

  transaccion<T>(fn: (tx: TxPresupuesto) => Promise<T>): Promise<T> {
    const tx: TxPresupuesto = {
      obtener: async (orgId, c) => {
        const e = this.presupuestos.get(k(orgId, c));
        return e ? clonar(e) : null;
      },
      guardar: async (orgId, c, e) => {
        this.presupuestos.set(k(orgId, c), clonar(e));
      },
      pendientePara: async (orgId, claves) => {
        const ids = new Set(claves.map((c) => `${c.ambito}|${c.refId}`));
        for (const s of this.solicitudes.values()) {
          if (
            s.orgId === orgId &&
            s.estado === "pendiente" &&
            s.claves.some((c) => ids.has(`${c.ambito}|${c.refId}`))
          ) {
            return clonar(s);
          }
        }
        return null;
      },
      crearSolicitud: async (s) => {
        this.solicitudes.set(s.id, clonar(s));
      },
      obtenerSolicitud: async (orgId, id) => {
        const s = this.solicitudes.get(id);
        return s && s.orgId === orgId ? clonar(s) : null;
      },
      guardarSolicitud: async (s) => {
        const actual = this.solicitudes.get(s.id);
        if (!actual || actual.orgId !== s.orgId)
          throw new Error("Solicitud inexistente");
        this.solicitudes.set(s.id, clonar(s));
      },
    };
    const r = this.cola.then(() => fn(tx));
    this.cola = r.catch(() => undefined);
    return r;
  }
}

/** Topes nuevos: tokens e iteraciones enteros > 0; costo finito > 0. */
export function validarTopes(t: Uso): void {
  const ok =
    Number.isSafeInteger(t.tokens) &&
    t.tokens > 0 &&
    Number.isSafeInteger(t.iteraciones) &&
    t.iteraciones > 0 &&
    Number.isFinite(t.costo) &&
    t.costo > 0;
  if (!ok) throw new Error("Topes de ampliacion invalidos");
}

export interface LimitesEjecucion {
  /** Profundidad maxima del arbol orquestador -> subagentes. */
  maxProfundidad: number;
  /** Iteraciones maximas de una misma ejecucion (bucle del agente). */
  maxIteraciones: number;
}

export const LIMITES_POR_DEFECTO: LimitesEjecucion = {
  maxProfundidad: 3,
  maxIteraciones: 25,
};

export interface PeticionReserva {
  orgId: string;
  agenteId: string;
  proyectoId: string | null;
  estimado: Uso;
  profundidad: number;
  /** Numero de iteracion actual dentro de la ejecucion (desde 1). */
  iteracion: number;
}

export type ResultadoReserva =
  | { estado: "ok"; avisos: AmbitoGuard[] }
  | {
      estado: "rechazado";
      motivo: "max_profundidad" | "max_iteraciones" | "sin_presupuesto";
    }
  | {
      estado: "pausado";
      excedidos: AmbitoGuard[];
      solicitud: SolicitudAmpliacion;
    };

export class ServicioPresupuesto {
  private readonly limites: LimitesEjecucion;

  constructor(
    private readonly repo: PresupuestoRepo,
    limites: Partial<LimitesEjecucion> = {},
    private readonly ahora: () => Date = () => new Date(),
    /** Si se inyecta, las decisiones de ampliacion se auditan. */
    private readonly auditor?: Auditor,
  ) {
    this.limites = { ...LIMITES_POR_DEFECTO, ...limites };
  }

  /**
   * Reserva atomica en agente, proyecto (si hay) y org. Los tres ambitos son obligatorios:
   * si falta alguno, se rechaza con "sin_presupuesto" (fail-closed).
   * Al exceder un tope no consume nada, pausa y deja una solicitud de ampliacion pendiente.
   */
  async reservar(p: PeticionReserva): Promise<ResultadoReserva> {
    if (p.profundidad > this.limites.maxProfundidad) {
      return { estado: "rechazado", motivo: "max_profundidad" };
    }
    if (p.iteracion > this.limites.maxIteraciones) {
      return { estado: "rechazado", motivo: "max_iteraciones" };
    }

    const claves: ClavePresupuesto[] = [
      { ambito: "agente", refId: p.agenteId },
      ...(p.proyectoId
        ? [{ ambito: "proyecto" as const, refId: p.proyectoId }]
        : []),
      { ambito: "org", refId: p.orgId },
    ];

    return this.repo.transaccion(async (tx) => {
      const presentes: {
        clave: ClavePresupuesto;
        estado: EstadoPresupuesto;
      }[] = [];
      for (const clave of claves) {
        const estado = await tx.obtener(p.orgId, clave);
        if (!estado) return { estado: "rechazado", motivo: "sin_presupuesto" };
        presentes.push({ clave, estado });
      }
      const r = reservar(
        presentes.map((x) => x.estado),
        p.estimado,
      );
      if (r.ok) {
        for (const [i, siguiente] of r.siguiente.entries()) {
          await tx.guardar(
            p.orgId,
            (presentes[i] as (typeof presentes)[number]).clave,
            siguiente,
          );
        }
        return { estado: "ok", avisos: r.avisos };
      }

      const clavesExcedidas = presentes
        .filter((x) => r.excedidos.includes(x.clave.ambito))
        .map((x) => x.clave);
      let solicitud = await tx.pendientePara(p.orgId, clavesExcedidas);
      if (!solicitud) {
        solicitud = {
          id: randomUUID(),
          orgId: p.orgId,
          tipo: "ampliacion_presupuesto",
          claves: clavesExcedidas,
          estimado: p.estimado,
          estado: "pendiente",
          decididoPor: null,
          creadaEn: this.ahora().toISOString(),
        };
        await tx.crearSolicitud(solicitud);
      }
      return { estado: "pausado", excedidos: r.excedidos, solicitud };
    });
  }

  /**
   * Concilia el consumo real tras la llamada: sustituye la reserva estimada por el uso
   * real en cada ambito (nunca por debajo de 0). Puede dejar el consumo por encima del
   * tope (el gasto ya ocurrio); la siguiente reserva se bloqueara.
   */
  async conciliar(p: {
    orgId: string;
    agenteId: string;
    proyectoId: string | null;
    estimado: Uso;
    real: Uso;
  }): Promise<void> {
    const claves: ClavePresupuesto[] = [
      { ambito: "agente", refId: p.agenteId },
      ...(p.proyectoId
        ? [{ ambito: "proyecto" as const, refId: p.proyectoId }]
        : []),
      { ambito: "org", refId: p.orgId },
    ];
    await this.repo.transaccion(async (tx) => {
      for (const clave of claves) {
        const e = await tx.obtener(p.orgId, clave);
        if (!e) continue;
        const aj = (d: keyof Uso) =>
          Math.max(0, e.consumido[d] - p.estimado[d] + p.real[d]);
        await tx.guardar(p.orgId, clave, {
          ...e,
          consumido: {
            tokens: aj("tokens"),
            costo: aj("costo"),
            iteraciones: aj("iteraciones"),
          },
        });
      }
    });
  }

  /** Decide una solicitud de ampliacion. Solo owner; nunca entre organizaciones. */
  async decidirAmpliacion(
    ctx: ContextoAcceso,
    solicitudId: string,
    decision: { aprobar: false } | { aprobar: true; nuevosTopes: Uso },
  ): Promise<SolicitudAmpliacion> {
    exigir(ctx, "presupuesto:ampliar", { orgId: ctx.orgId });
    if (decision.aprobar) validarTopes(decision.nuevosTopes);
    const decidida = await this.repo.transaccion(async (tx) => {
      const s = await tx.obtenerSolicitud(ctx.orgId, solicitudId);
      if (!s) throw new Error("Solicitud no encontrada");
      if (s.estado !== "pendiente") throw new Error("Solicitud ya decidida");
      if (decision.aprobar) {
        for (const clave of s.claves) {
          const e = await tx.obtener(ctx.orgId, clave);
          if (!e) continue;
          await tx.guardar(ctx.orgId, clave, {
            ...e,
            tope: { ...decision.nuevosTopes },
          });
        }
      }
      const decidida: SolicitudAmpliacion = {
        ...s,
        estado: decision.aprobar ? "aprobada" : "rechazada",
        decididoPor: ctx.usuarioId,
      };
      await tx.guardarSolicitud(decidida);
      return decidida;
    });
    await this.auditor?.anexar({
      orgId: ctx.orgId,
      actor: ctx.usuarioId,
      accion: decidida.estado === "aprobada" ? "presupuesto:ampliar" : "presupuesto:rechazar_ampliacion",
      entidad: `solicitud_ampliacion:${solicitudId}`,
      despues: {
        estado: decidida.estado,
        claves: decidida.claves,
        ...(decision.aprobar ? { nuevosTopes: decision.nuevosTopes } : {}),
      },
    });
    return decidida;
  }
}

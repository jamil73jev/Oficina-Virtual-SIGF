import { Aleatorio } from "@/modules/finanzas";
import type { Beneficiario, Caja, DatosPagos, NovedadCaja, OrdenPago, Turno } from "./domain";

const pad = (n: number) => String(n).padStart(3, "0");
const sumarHoras = (fecha: Date, horas: number) => new Date(fecha.getTime() + horas * 3_600_000);

/** Datos ficticios deterministas con casos borde obligatorios para pagos y cajas. */
export function generarDatosPagos(semilla: number | string = 20260901): DatosPagos {
  const rnd = new Aleatorio(semilla);
  const beneficiarios: Beneficiario[] = Array.from({ length: 8 }, (_, i) => ({
    id: `B${pad(i + 1)}`,
    identificacion: `099000${pad(i + 1)}1`,
    nombre: `Beneficiario Sintético ${pad(i + 1)}`,
    cuentaBancaria: i === 1 ? null : `CTA-${pad(rnd.entero(1, 999))}`,
  }));
  const conceptos = ["Servicio técnico", "Suministros", "Mantenimiento", "Consultoría"];
  const ordenes: OrdenPago[] = Array.from({ length: 12 }, (_, i) => ({
    id: `OP${pad(i + 1)}`,
    beneficiarioId: beneficiarios[i % beneficiarios.length]?.id ?? "B001",
    concepto: conceptos[i % conceptos.length] ?? "Servicio",
    valor: rnd.entero(10_000, 250_000) / 100,
    partidaId: `P${(i % 3) + 1}`,
    estado: i % 4 === 0 ? "validada" : "solicitada",
    fechaSolicitud: new Date(Date.UTC(2026, 7, 1 + i)),
  }));
  // Casos forzados: sin partida, sin disponibilidad y duplicado exacto.
  if (ordenes[0]) ordenes[0].partidaId = null;
  if (ordenes[1]) ordenes[1].partidaId = "P-SIN-DISP";
  if (ordenes[2] && ordenes[3]) {
    ordenes[3].beneficiarioId = ordenes[2].beneficiarioId;
    ordenes[3].concepto = ordenes[2].concepto;
    ordenes[3].valor = ordenes[2].valor;
  }

  const cajas: Caja[] = [
    { id: "C1", sede: "Centro", nombre: "Caja 1" },
    { id: "C2", sede: "Norte", nombre: "Caja 2" },
    { id: "C3", sede: "Centro", nombre: "Caja 3" },
  ];
  const base = new Date("2026-08-31T08:00:00.000Z");
  const turnos: Turno[] = [
    { id: "T1", cajaId: "C1", cajeroId: "CJ1", apertura: base, cierre: sumarHoras(base, 8), fondoInicial: 100, recaudadoSistema: 5000, contadoFisico: 5105 },
    { id: "T2", cajaId: "C2", cajeroId: "CJ2", apertura: sumarHoras(base, 2), cierre: sumarHoras(base, 10), fondoInicial: 100, recaudadoSistema: 700, contadoFisico: 780 },
    { id: "T3", cajaId: "C3", cajeroId: "CJ3", apertura: sumarHoras(base, 11), cierre: sumarHoras(base, 17), fondoInicial: 100, recaudadoSistema: 40, contadoFisico: 145 },
    { id: "T4", cajaId: "C1", cajeroId: "CJ4", apertura: sumarHoras(base, 24), fondoInicial: 100, recaudadoSistema: 900 },
  ];
  const novedades: NovedadCaja[] = [
    { id: "N1", turnoId: "T1", tipo: "sobrante", valor: 5, observacion: "Caso sintético de sobrante" },
    { id: "N2", turnoId: "T2", tipo: "faltante", valor: 20, observacion: "Caso sintético de faltante" },
  ];
  return {
    ordenes,
    beneficiarios,
    cajas,
    turnos,
    novedades,
    disponibilidades: { P1: 10_000, P2: 2_000, P3: 5_000 },
    corte: { fechaCorte: new Date("2026-08-31T00:00:00.000Z"), horaExtraccion: "23:59", periodo: "2026-08", fuente: "pagaduria_caja_sintetica" },
  };
}


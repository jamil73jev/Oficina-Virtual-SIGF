import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { HERRAMIENTAS_FINANZAS } from "@/modules/finanzas";
import {
  Asiento,
  balanceComprobacion,
  Certificacion,
  conciliacionContable,
  CuentaContable,
  cuadreFinContPres,
  disponibilidadPartida,
  ejecucionPresupuestaria,
  ejecutarHerramientaContable,
  FUENTES_CONTABLES,
  generarDatosContables,
  HERRAMIENTAS_CONTABLE,
  NOMBRES_HERRAMIENTAS_CONTABLE,
  PartidaPresupuestaria,
  reformasCertificaciones,
  type DatosContables,
} from "@/modules/finanzas-contable";

const corteDe = (d: DatosContables, fuente: string) => {
  const c = d.cortes.find((x) => x.fuente === fuente);
  if (!c) throw new Error(`sin corte ${fuente}`);
  return c;
};

describe("generarDatosContables", () => {
  const datos = generarDatosContables();
  const cortePres = corteDe(datos, FUENTES_CONTABLES.presupuesto);
  const corteCont = corteDe(datos, FUENTES_CONTABLES.contabilidad);

  it("es determinista por semilla", () => {
    expect(JSON.stringify(generarDatosContables(7))).toBe(JSON.stringify(generarDatosContables(7)));
    expect(JSON.stringify(generarDatosContables(20260831))).toBe(JSON.stringify(datos));
    expect(JSON.stringify(generarDatosContables("otra"))).not.toBe(JSON.stringify(generarDatosContables(7)));
  });

  it("cumple los contratos Zod y respeta el tamano configurable", () => {
    for (const p of datos.partidas) PartidaPresupuestaria.parse(p);
    for (const c of datos.certificaciones) Certificacion.parse(c);
    for (const c of datos.cuentas) CuentaContable.parse(c);
    for (const a of datos.asientos) Asiento.parse(a);
    expect(datos.partidas.filter((p) => p.tipo === "gasto")).toHaveLength(24);
    const chico = generarDatosContables(1, { partidasGasto: 4, partidasIngreso: 2 });
    expect(chico.partidas).toHaveLength(6);
  });

  it("incluye los casos borde presupuestarios", () => {
    const ejec = ejecucionPresupuestaria({ corte: cortePres, ejercicio: datos.ejercicio, partidas: datos.partidas });
    const tipos = new Set(ejec.valor.desviaciones.map((d) => d.tipo));
    expect(tipos.has("codificado_negativo")).toBe(true);
    expect(tipos.has("sobreejecucion")).toBe(true);
    expect(ejec.valor.reformasPosterioresAlCorte.length).toBeGreaterThan(0);

    const disp = disponibilidadPartida({ corte: cortePres, ejercicio: datos.ejercicio, partidas: datos.partidas });
    expect(disp.valor.alertas.length).toBeGreaterThan(0);

    const rc = reformasCertificaciones({
      corte: cortePres,
      ejercicio: datos.ejercicio,
      partidas: datos.partidas,
      certificaciones: datos.certificaciones,
    });
    expect(rc.valor.reformas.equilibrioInicial?.diferencia).toBe(0);
    expect(rc.valor.reformas.traspasosNeto).toBe(0);
    expect(rc.valor.reformas.partidasCodificadoNegativo.length).toBeGreaterThan(0);
    expect(rc.valor.reformas.cuadran).toBe(false);
    expect(rc.valor.certificaciones.sinComprometer.length).toBeGreaterThan(0);
    expect(rc.valor.certificaciones.diferenciasConPartida).toEqual([]);
  });

  it("incluye un asiento descuadrado y diferencias entre conciliado y contabilizado", () => {
    const balance = balanceComprobacion({ corte: corteCont, cuentas: datos.cuentas, asientos: datos.asientos });
    expect(balance.valor.cuadra).toBe(false);
    expect(balance.valor.asientosDescuadrados).toHaveLength(1);
    expect(balance.valor.diferencia).toBe(0.5);

    const conc = conciliacionContable({ corte: corteCont, asientos: datos.asientos, subsistemas: datos.subsistemas });
    expect(conc.valor.filas.find((f) => f.origen === "recaudacion")?.estado).toBe("diferencia");
    expect(conc.valor.filas.find((f) => f.origen === "pago")?.estado).toBe("cuadra");

    const cuadre = cuadreFinContPres({
      corte: corteCont,
      cortesFuentes: datos.cortes.filter((c) => c.fuente !== corteCont.fuente),
      filas: datos.cuadre,
      justificaciones: datos.justificaciones,
    });
    const estados = cuadre.valor.matriz.flatMap((f) => f.tramos.map((t) => t.estado));
    expect(estados).toContain("justificada");
    expect(estados).toContain("pendiente");
    expect(cuadre.valor.pendientesPorResolver.some((p) => p.tramo === "conciliado_contabilizado")).toBe(true);
  });

  it.each([1, 2, 3, "a", "b"])("mantiene los invariantes con la semilla %s", (semilla) => {
    const d = generarDatosContables(semilla);
    const rc = reformasCertificaciones({ corte: corteDe(d, "presupuesto"), ejercicio: d.ejercicio, partidas: d.partidas, certificaciones: d.certificaciones });
    expect(rc.valor.reformas.equilibrioCodificado?.diferencia).toBe(0);
    expect(rc.valor.reformas.traspasosDescuadrados).toEqual([]);
    const b = balanceComprobacion({ corte: corteDe(d, "contabilidad"), cuentas: d.cuentas, asientos: d.asientos });
    expect(b.valor.asientosDescuadrados).toHaveLength(1);
    expect(b.valor.lineasCuentaNoCatalogada).toEqual([]);
  });
});

describe("HERRAMIENTAS_CONTABLE", () => {
  it("expone las seis calculadoras con el formato de HERRAMIENTAS_FINANZAS", () => {
    expect(NOMBRES_HERRAMIENTAS_CONTABLE).toEqual([
      "ejecucion_presupuestaria",
      "disponibilidad_partida",
      "reformas_certificaciones",
      "conciliacion_contable",
      "cuadre_fin_cont_pres",
      "balance_comprobacion",
    ]);
    const formato = Object.keys(HERRAMIENTAS_FINANZAS.recaudacion_neta).sort();
    for (const h of Object.values(HERRAMIENTAS_CONTABLE)) expect(Object.keys(h).sort()).toEqual(formato);
    for (const nombre of NOMBRES_HERRAMIENTAS_CONTABLE) expect(nombre in HERRAMIENTAS_FINANZAS).toBe(false);
  });

  it("valida la entrada cruda (fechas como texto) y rechaza la invalida", () => {
    const datos = JSON.parse(JSON.stringify(generarDatosContables(3))) as Record<string, unknown[]>;
    const corte = (datos.cortes as { fuente: string }[]).find((c) => c.fuente === "contabilidad");
    const r = ejecutarHerramientaContable("balance_comprobacion", { corte, cuentas: datos.cuentas, asientos: datos.asientos });
    expect(r.fuente).toBe("contabilidad");
    expect(() => ejecutarHerramientaContable("disponibilidad_partida", { corte, ejercicio: "2026", partidas: [] })).toThrow(ZodError);
  });
});

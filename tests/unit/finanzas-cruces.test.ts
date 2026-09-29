import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  cruzarIdentificaciones,
  ejecutarHerramientaFinanzas,
  generarDatosSinteticos,
  HERRAMIENTAS_FINANZAS,
  normalizarIdentificacion,
  type Contribuyente,
  type Corte,
  type Juicio,
  type Titulo,
} from "@/modules/finanzas";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const CORTE: Corte = { fechaCorte: d("2026-08-31"), horaExtraccion: "08:00", periodo: "2026-08", fuente: "coactiva" };

const contribuyente = (id: string, identificacion: string): Contribuyente => ({
  id,
  tipoIdentificacion: "cedula",
  identificacion,
  nombre: `Contribuyente ${id}`,
});

const titulo = (id: string, contribuyenteId: string, valorEmitido = 100): Titulo => ({
  id,
  contribuyenteId,
  rubroId: "RB01",
  valorEmitido,
  fechaEmision: d("2025-01-01"),
  fechaVencimiento: d("2025-01-31"),
  estado: "en_coactiva",
});

const juicio = (id: string, tituloId: string, identificacionDemandado?: string | null): Juicio => ({
  id,
  codigo: `JC-${id}`,
  tituloId,
  juzgado: "Juzgado de coactiva 01",
  estado: "en_tramite",
  fecha: d("2026-01-01"),
  ...(identificacionDemandado === undefined ? {} : { identificacionDemandado }),
});

const CONTRIBUYENTES = [contribuyente("C1", "0912345678"), contribuyente("C2", "0102030405"), contribuyente("C3", "")];

describe("cruzarIdentificaciones", () => {
  it("clasifica coincidente, diferente y no utilizable con datos conocidos", () => {
    const r = cruzarIdentificaciones({
      corte: CORTE,
      contribuyentes: CONTRIBUYENTES,
      titulos: [titulo("T1", "C1"), titulo("T2", "C1"), titulo("T3", "C1"), titulo("T4", "C1"), titulo("T5", "C1"), titulo("T6", "C3")],
      juicios: [
        juicio("J1", "T1", "0912345678"),
        juicio("J2", "T2", "0102030405"),
        juicio("J3", "T3"), // falta
        juicio("J4", "T4", "   "), // solo espacios
        juicio("J5", "T5", "12"), // longitud imposible
        juicio("J6", "T6", "0912345678"), // el contribuyente no tiene identificacion
      ],
    });
    const ids = (pares: { juicioId: string }[]) => pares.map((p) => p.juicioId);
    expect(ids(r.valor.pares.coincidentes)).toEqual(["J1"]);
    expect(ids(r.valor.pares.diferentes)).toEqual(["J2"]);
    expect(ids(r.valor.pares.noUtilizables)).toEqual(["J3", "J4", "J5", "J6"]);
    expect(r.valor.conteos).toEqual({ coincidentes: 1, diferentes: 1, noUtilizables: 4 });
    expect(r.valor.pares.noUtilizables.map((p) => p.motivo)).toEqual([
      "identificacion_demandado_faltante",
      "identificacion_demandado_faltante",
      "identificacion_demandado_inutilizable",
      "identificacion_contribuyente_inutilizable",
    ]);
  });

  it("normaliza guiones y espacios antes de comparar", () => {
    expect(normalizarIdentificacion(" 091234567-8 ")).toBe("0912345678");
    const r = cruzarIdentificaciones({
      corte: CORTE,
      contribuyentes: CONTRIBUYENTES,
      titulos: [titulo("T1", "C1")],
      juicios: [juicio("J1", "T1", "091234567-8"), juicio("J2", "T1", " 09123 45678 "), juicio("J3", "T1", "0912345679")],
    });
    expect(r.valor.pares.coincidentes.map((p) => p.juicioId)).toEqual(["J1", "J2"]);
    expect(r.valor.pares.diferentes.map((p) => p.juicioId)).toEqual(["J3"]);
  });

  it("cuenta un titulo con 3 juicios tres veces en el cruce pero no triplica su valor", () => {
    const r = cruzarIdentificaciones({
      corte: CORTE,
      contribuyentes: CONTRIBUYENTES,
      titulos: [titulo("T1", "C1", 250.5), titulo("T2", "C2", 40), titulo("T3", "C2", 9)],
      juicios: [juicio("J1", "T1", "0912345678"), juicio("J2", "T1", "0102030405"), juicio("J3", "T1", ""), juicio("J4", "T2", "0102030405")],
    });
    expect(r.valor.totalPares).toBe(4);
    expect(r.valor.conteos).toEqual({ coincidentes: 2, diferentes: 1, noUtilizables: 1 });
    expect(r.valor.valorTitulosConJuicio).toBe(290.5);
    expect(r.valor.titulosConJuicio).toBe(2);
    expect(r.valor.titulosConVariosJuicios).toBe(1);
    expect(r.valor.titulosSinJuicio).toBe(1);
  });

  it("el total del cruce es el numero de pares y no excluye registros (juicios huerfanos incluidos)", () => {
    const r = cruzarIdentificaciones({
      corte: CORTE,
      contribuyentes: CONTRIBUYENTES,
      titulos: [titulo("T1", "C1"), titulo("T9", "C404")],
      juicios: [juicio("J1", "T1", "0912345678"), juicio("J2", "T-NO-EXISTE", "0912345678"), juicio("J3", "T9", "0912345678")],
    });
    const { pares, conteos } = r.valor;
    expect(r.valor.totalPares).toBe(pares.coincidentes.length + pares.diferentes.length + pares.noUtilizables.length);
    expect(r.valor.totalPares).toBe(conteos.coincidentes + conteos.diferentes + conteos.noUtilizables);
    expect(r.valor.totalPares).toBe(3);
    expect(pares.noUtilizables.map((p) => p.motivo)).toEqual(["titulo_inexistente", "contribuyente_inexistente"]);
    expect(r.valor.cuadra).toBe(true);
  });

  it("declara fuente, formula, filtros y corte", () => {
    const r = cruzarIdentificaciones({ corte: CORTE, contribuyentes: [], titulos: [], juicios: [] });
    expect(r.fuente).toBe("coactiva");
    expect(r.formula).toContain("coincidente");
    expect(r.filtros).toContain("ninguna exclusion");
    expect(r.corte).toBe(CORTE);
    expect(r.valor.totalPares).toBe(0);
  });

  it("esta registrada como herramienta con esquema Zod", () => {
    expect(HERRAMIENTAS_FINANZAS.cruzar_identificaciones.esquemaEntrada).toBeDefined();
    const corte = { fechaCorte: "2026-08-31", horaExtraccion: "08:00", periodo: "2026-08", fuente: "coactiva" };
    const r = ejecutarHerramientaFinanzas("cruzar_identificaciones", {
      corte,
      contribuyentes: [{ id: "C1", tipoIdentificacion: "cedula", identificacion: "0912345678", nombre: "X" }],
      titulos: [
        {
          id: "T1",
          contribuyenteId: "C1",
          rubroId: "RB01",
          valorEmitido: 10,
          fechaEmision: "2025-01-01",
          fechaVencimiento: "2025-01-31",
          estado: "en_coactiva",
        },
      ],
      juicios: [{ id: "J1", codigo: "JC-1", tituloId: "T1", juzgado: "J", estado: "en_tramite", fecha: "2026-01-01", identificacionDemandado: "0912345678" }],
    });
    expect((r.valor as { conteos: { coincidentes: number } }).conteos.coincidentes).toBe(1);
    expect(() => ejecutarHerramientaFinanzas("cruzar_identificaciones", { corte, titulos: "x" })).toThrow(ZodError);
  });
});

describe("generador: identificacionDemandado", () => {
  const datos = generarDatosSinteticos();
  const cruce = cruzarIdentificaciones({ corte: datos.cortes[3] ?? CORTE, ...datos }).valor;

  it("es determinista con la misma semilla", () => {
    const juiciosDe = (semilla: number) => JSON.stringify(generarDatosSinteticos({ semilla }).juicios);
    expect(juiciosDe(11)).toBe(juiciosDe(11));
    expect(JSON.stringify(generarDatosSinteticos().juicios)).toBe(JSON.stringify(datos.juicios));
  });

  it("la mayoria coincide y hay diferentes, faltantes y no utilizables", () => {
    expect(cruce.totalPares).toBe(datos.juicios.length);
    expect(cruce.conteos.coincidentes).toBeGreaterThan(cruce.totalPares / 2);
    expect(cruce.conteos.diferentes).toBeGreaterThan(0);
    const motivos = new Set(cruce.pares.noUtilizables.map((p) => p.motivo));
    expect(motivos).toContain("identificacion_demandado_faltante");
    expect(motivos).toContain("identificacion_demandado_inutilizable");
    const brutas = datos.juicios.map((j) => j.identificacionDemandado);
    expect(brutas).toContain(undefined);
    expect(brutas).toContain("");
    expect(brutas).toContain("   ");
  });

  it("incluye titulos con varios juicios con identificaciones distintas", () => {
    const porTitulo = new Map<string, Set<string>>();
    for (const j of datos.juicios) {
      const set = porTitulo.get(j.tituloId) ?? new Set<string>();
      set.add(normalizarIdentificacion(j.identificacionDemandado ?? ""));
      porTitulo.set(j.tituloId, set);
    }
    expect([...porTitulo.values()].some((s) => s.size > 1)).toBe(true);
    expect(cruce.titulosConVariosJuicios).toBeGreaterThan(0);
  });

  it("los tamanos pequenos tambien producen juicios con varios casos", () => {
    const chico = generarDatosSinteticos({ contribuyentes: 5, titulos: 30 });
    expect(chico.juicios.length).toBeGreaterThanOrEqual(3);
  });
});

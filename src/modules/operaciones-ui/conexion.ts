import { EventoTraza, InstantaneaOperacion, NOMBRE_EVENTO_SSE, type InstantaneaOperacion as Instantanea } from "@/orchestration/traza/eventos";
import { aplicarEvento, aplicarInstantanea, estadoInicialOperacion, type EstadoOperacionUi } from "./estado";

export type EstadoConexion = "conectado" | "reconectando";

export interface EventSourceOperacion {
  addEventListener(tipo: string, listener: (evento: MessageEvent<string>) => void): void;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export interface VistaConexionOperacion extends EstadoOperacionUi {
  cargando: boolean;
  error: string | null;
  conexion: EstadoConexion;
}

export interface DependenciasConexion {
  fetcher?: typeof fetch;
  crearEventSource?: (url: string, ultimoEventoId: string | null) => EventSourceOperacion;
  programar?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancelar?: (id: ReturnType<typeof setTimeout>) => void;
}

const fuenteNativa = (url: string): EventSourceOperacion => new EventSource(url) as EventSourceOperacion;

export async function cargarEventoOperacion(operacionId: string, secuencia: number, fetcher: typeof fetch = fetch): Promise<EventoTraza> {
  const respuesta = await fetcher(`/api/operaciones/${encodeURIComponent(operacionId)}/eventos/${secuencia}`, { cache: "no-store" });
  if (!respuesta.ok) throw new Error(`evento_${respuesta.status}`);
  return EventoTraza.parse(await respuesta.json());
}

export async function cargarEntregableOperacion(operacionId: string, fetcher: typeof fetch = fetch): Promise<string> {
  const respuesta = await fetcher(`/api/operaciones/${encodeURIComponent(operacionId)}/entregable`, { cache: "no-store" });
  if (!respuesta.ok) throw new Error(`entregable_${respuesta.status}`);
  return respuesta.text();
}

export class ConexionOperacion {
  private vista: VistaConexionOperacion = { ...estadoInicialOperacion, cargando: true, error: null, conexion: "reconectando" };
  private fuente: EventSourceOperacion | null = null;
  private temporizadorReconexion: ReturnType<typeof setTimeout> | null = null;
  private temporizadorSondeo: ReturnType<typeof setTimeout> | null = null;
  private intento = 0;
  private detenida = false;
  private readonly fetcher: typeof fetch;
  private readonly crearFuente: NonNullable<DependenciasConexion["crearEventSource"]>;
  private readonly programar: NonNullable<DependenciasConexion["programar"]>;
  private readonly cancelar: NonNullable<DependenciasConexion["cancelar"]>;

  constructor(
    private readonly operacionId: string,
    private readonly alCambiar: (vista: VistaConexionOperacion) => void,
    deps: DependenciasConexion = {},
  ) {
    this.fetcher = deps.fetcher ?? fetch;
    this.crearFuente = deps.crearEventSource ?? fuenteNativa;
    this.programar = deps.programar ?? setTimeout;
    this.cancelar = deps.cancelar ?? clearTimeout;
  }

  obtenerVista() { return this.vista; }

  private publicar(cambio: Partial<VistaConexionOperacion>) {
    this.vista = { ...this.vista, ...cambio };
    this.alCambiar(this.vista);
  }

  private async pedirInstantanea(): Promise<Instantanea> {
    const respuesta = await this.fetcher(`/api/operaciones/${encodeURIComponent(this.operacionId)}`, { cache: "no-store" });
    if (!respuesta.ok) throw new Error(`instantanea_${respuesta.status}`);
    return InstantaneaOperacion.parse(await respuesta.json());
  }

  async iniciar() {
    try {
      const instantanea = await this.pedirInstantanea();
      const siguiente = aplicarInstantanea(this.vista, instantanea);
      this.publicar({ ...siguiente, cargando: false, error: null });
      this.abrirSse();
    } catch (error) {
      this.publicar({ cargando: false, error: error instanceof Error ? error.message : "error" });
    }
  }

  private abrirSse() {
    if (this.detenida) return;
    const ultimoId = this.vista.ultimaSecuencia > 0 ? String(this.vista.ultimaSecuencia) : null;
    const sufijo = ultimoId ? `?ultimoEventoId=${encodeURIComponent(ultimoId)}` : "";
    this.fuente = this.crearFuente(`/api/operaciones/${encodeURIComponent(this.operacionId)}/eventos${sufijo}`, ultimoId);
    this.fuente.onopen = () => {
      this.intento = 0;
      this.detenerSondeo();
      this.publicar({ conexion: "conectado", error: null });
    };
    this.fuente.addEventListener(NOMBRE_EVENTO_SSE, (mensaje) => {
      let datos: unknown;
      try { datos = JSON.parse(mensaje.data) as unknown; } catch { return; }
      const analisis = EventoTraza.safeParse(datos);
      if (!analisis.success || analisis.data.secuencia <= this.vista.ultimaSecuencia) return;
      const siguiente = aplicarEvento(this.vista, analisis.data);
      this.publicar(siguiente);
      if (analisis.data.tipo === "operacion_finalizada") this.detener();
    });
    this.fuente.onerror = () => this.reconectar();
  }

  private reconectar() {
    if (this.detenida || this.temporizadorReconexion) return;
    this.publicar({ conexion: "reconectando" });
    this.fuente?.close();
    this.fuente = null;
    this.iniciarSondeo();
    const espera = Math.min(1_000 * 2 ** this.intento++, 30_000);
    this.temporizadorReconexion = this.programar(() => {
      this.temporizadorReconexion = null;
      this.abrirSse();
    }, espera);
  }

  private iniciarSondeo() {
    if (this.temporizadorSondeo || this.detenida) return;
    const consultar = async () => {
      try {
        const instantanea = await this.pedirInstantanea();
        this.publicar(aplicarInstantanea(this.vista, instantanea));
      } catch { /* El SSE sigue reintentando; el sondeo volvera a intentar. */ }
      if (!this.detenida && this.vista.conexion === "reconectando") {
        this.temporizadorSondeo = this.programar(() => { this.temporizadorSondeo = null; void consultar(); }, 3_000);
      }
    };
    this.temporizadorSondeo = this.programar(() => { this.temporizadorSondeo = null; void consultar(); }, 3_000);
  }

  private detenerSondeo() {
    if (this.temporizadorSondeo) this.cancelar(this.temporizadorSondeo);
    this.temporizadorSondeo = null;
  }

  detener() {
    this.detenida = true;
    this.fuente?.close();
    if (this.temporizadorReconexion) this.cancelar(this.temporizadorReconexion);
    this.detenerSondeo();
    this.fuente = null;
    this.temporizadorReconexion = null;
  }
}

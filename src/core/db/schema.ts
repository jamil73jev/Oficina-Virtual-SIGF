import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const rolEnum = pgEnum("rol", [
  "owner",
  "admin",
  "supervisor",
  "viewer",
]);
export const autorTipoEnum = pgEnum("autor_tipo", ["humano", "agente"]);
export const ambitoEnum = pgEnum("ambito_presupuesto", [
  "org",
  "proyecto",
  "agente",
]);
export const riesgoEnum = pgEnum("riesgo", [
  "lectura",
  "escritura_reversible",
  "irreversible",
]);
export const estadoAprobacionEnum = pgEnum("estado_aprobacion", [
  "pendiente",
  "aprobada",
  "rechazada",
  "expirada",
]);
export const estadoEjecucionEnum = pgEnum("estado_ejecucion", [
  "pendiente",
  "en_curso",
  "pausada",
  "completada",
  "fallida",
  "cancelada",
]);
export const estadoTareaEnum = pgEnum("estado_tarea", [
  "pendiente",
  "asignada",
  "en_curso",
  "en_verificacion",
  "completada",
  "fallida",
  "bloqueada",
]);
export const estadoProyectoEnum = pgEnum("estado_proyecto", [
  "borrador",
  "activo",
  "pausado",
  "completado",
  "archivado",
]);
export const estadoAgenteEnum = pgEnum("estado_agente", [
  "activo",
  "inactivo",
  "pausado",
]);
export const estadoSolicitudAmpliacionEnum = pgEnum(
  "estado_solicitud_ampliacion",
  ["pendiente", "aprobada", "rechazada"],
);

const pk = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => organizacion.id);
const creadoEn = () =>
  timestamp("creado_en", { withTimezone: true }).notNull().defaultNow();

export const organizacion = pgTable("organizacion", {
  id: pk(),
  nombre: text("nombre").notNull(),
  huso: text("huso").notNull(),
  moneda: text("moneda").notNull(),
  locale: text("locale").notNull(),
});

// Global (no de negocio): una persona puede pertenecer a varias organizaciones.
export const usuario = pgTable("usuario", {
  id: pk(),
  email: text("email").notNull().unique(),
  mfa: boolean("mfa").notNull().default(false),
});

export const membresia = pgTable(
  "membresia",
  {
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuario.id),
    orgId: orgId(),
    rol: rolEnum("rol").notNull(),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.orgId] })],
);

export const presupuesto = pgTable(
  "presupuesto",
  {
    id: pk(),
    orgId: orgId(),
    ambito: ambitoEnum("ambito").notNull(),
    /** Entidad presupuestada: agente.id, proyecto.id o, en el ambito org, el propio org_id. */
    refId: uuid("ref_id").notNull(),
    topeTokens: integer("tope_tokens").notNull(),
    topeCosto: doublePrecision("tope_costo").notNull(),
    topeIteraciones: integer("tope_iteraciones").notNull(),
    consumidoTokens: integer("consumido_tokens").notNull().default(0),
    consumidoCosto: doublePrecision("consumido_costo").notNull().default(0),
    consumidoIteraciones: integer("consumido_iteraciones").notNull().default(0),
    periodo: text("periodo").notNull(),
  },
  (t) => [
    index("presupuesto_org_idx").on(t.orgId),
    // Un presupuesto vigente por ambito y entidad (clave de la reserva atomica).
    unique("presupuesto_org_ambito_ref_uq").on(t.orgId, t.ambito, t.refId),
  ],
);

// Solicitud de ampliacion creada al exceder un tope (el guard pausa y espera decision del owner).
export const solicitudAmpliacion = pgTable(
  "solicitud_ampliacion",
  {
    id: pk(),
    orgId: orgId(),
    /** ClavePresupuesto[]: [{ ambito, refId }]. */
    claves: jsonb("claves").notNull(),
    /** Uso estimado que provoco la pausa: { tokens, costo, iteraciones }. */
    estimado: jsonb("estimado").notNull(),
    estado: estadoSolicitudAmpliacionEnum("estado")
      .notNull()
      .default("pendiente"),
    decididoPor: text("decidido_por"),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull(),
  },
  (t) => [index("solicitud_ampliacion_org_estado_idx").on(t.orgId, t.estado)],
);

export const agente = pgTable(
  "agente",
  {
    id: pk(),
    orgId: orgId(),
    rol: text("rol").notNull(),
    skills: text("skills")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    herramientasPermitidas: text("herramientas_permitidas")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    modelo: text("modelo").notNull(),
    presupuestoId: uuid("presupuesto_id").references(() => presupuesto.id),
    estado: estadoAgenteEnum("estado").notNull().default("activo"),
    promptVersion: integer("prompt_version").notNull().default(1),
  },
  (t) => [index("agente_org_idx").on(t.orgId)],
);

export const proyecto = pgTable(
  "proyecto",
  {
    id: pk(),
    orgId: orgId(),
    objetivo: text("objetivo").notNull(),
    estado: estadoProyectoEnum("estado").notNull().default("borrador"),
    presupuestoId: uuid("presupuesto_id").references(() => presupuesto.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => usuario.id),
  },
  (t) => [
    index("proyecto_org_idx").on(t.orgId),
    // Destino de las FK compuestas (org_id, proyecto_id): impide cruzar organizaciones.
    unique("proyecto_org_id_uq").on(t.orgId, t.id),
  ],
);

// proyecto_id y agente_id sin FK: las tareas de la Sala de operaciones cuelgan de un proyecto
// logico fijo (PROYECTO_OPERACIONES) y de agentes del catalogo (codigo), comunes a todas las
// organizaciones; la PK global de proyecto/agente impide sembrarlos por organizacion. El
// servicio de proyectos valida el proyecto; RLS y org_id siguen aislando cada fila.
export const tarea = pgTable(
  "tarea",
  {
    id: pk(),
    orgId: orgId(),
    proyectoId: uuid("proyecto_id").notNull(),
    padreId: uuid("padre_id"),
    agenteId: uuid("agente_id"),
    estado: estadoTareaEnum("estado").notNull().default("pendiente"),
    criteriosVerificacion: text("criterios_verificacion")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    deps: uuid("deps")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** Detalle del orquestador (TareaOrq); vacio en las tareas del tablero. */
    titulo: text("titulo").notNull().default(""),
    descripcion: text("descripcion").notNull().default(""),
    rolAgente: text("rol_agente"),
  },
  (t) => [
    index("tarea_org_proyecto_idx").on(t.orgId, t.proyectoId),
    unique("tarea_org_id_uq").on(t.orgId, t.id),
  ],
);

// Cabecera del documento: refleja la version actual (la ultima de documento_version).
export const documento = pgTable(
  "documento",
  {
    id: pk(),
    orgId: orgId(),
    proyectoId: uuid("proyecto_id").notNull(),
    tareaId: uuid("tarea_id"),
    blobUrl: text("blob_url").notNull(),
    hash: text("hash").notNull(),
    version: integer("version").notNull().default(1),
    tipo: text("tipo").notNull(),
    nombre: text("nombre").notNull().default(""),
  },
  (t) => [
    index("documento_org_proyecto_idx").on(t.orgId, t.proyectoId),
    index("documento_org_tarea_idx").on(t.orgId, t.tareaId),
    unique("documento_org_id_uq").on(t.orgId, t.id),
    // FK compuestas: proyecto y tarea deben ser de la misma organizacion.
    foreignKey({
      name: "documento_proyecto_org_fk",
      columns: [t.orgId, t.proyectoId],
      foreignColumns: [proyecto.orgId, proyecto.id],
    }),
    foreignKey({
      name: "documento_tarea_org_fk",
      columns: [t.orgId, t.tareaId],
      foreignColumns: [tarea.orgId, tarea.id],
    }),
  ],
);

// Historial inmutable de versiones (sin UPDATE ni DELETE para la aplicacion).
export const documentoVersion = pgTable(
  "documento_version",
  {
    id: pk(),
    orgId: orgId(),
    documentoId: uuid("documento_id").notNull(),
    version: integer("version").notNull(),
    proyectoId: uuid("proyecto_id").notNull(),
    tareaId: uuid("tarea_id"),
    blobUrl: text("blob_url").notNull(),
    /** SHA-256 hex del contenido. */
    hash: text("hash").notNull(),
    tipo: text("tipo").notNull(),
    nombre: text("nombre").notNull(),
    tamano: integer("tamano").notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull(),
    creadoPor: text("creado_por").notNull(),
  },
  (t) => [
    unique("documento_version_doc_version_uq").on(t.documentoId, t.version),
    foreignKey({
      name: "documento_version_documento_org_fk",
      columns: [t.orgId, t.documentoId],
      foreignColumns: [documento.orgId, documento.id],
    }),
  ],
);

export const mensaje = pgTable(
  "mensaje",
  {
    id: pk(),
    orgId: orgId(),
    proyectoId: uuid("proyecto_id")
      .notNull()
      .references(() => proyecto.id),
    hilo: text("hilo").notNull(),
    autorTipo: autorTipoEnum("autor_tipo").notNull(),
    autorId: uuid("autor_id").notNull(),
    contenido: text("contenido").notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [
    index("mensaje_org_proyecto_hilo_idx").on(t.orgId, t.proyectoId, t.hilo),
  ],
);

export const ejecucion = pgTable(
  "ejecucion",
  {
    id: pk(),
    orgId: orgId(),
    tareaId: uuid("tarea_id").notNull(),
    /** Agente del catalogo (sin FK, ver tarea). */
    agenteId: uuid("agente_id").notNull(),
    padreEjecucionId: uuid("padre_ejecucion_id"),
    workflowRunId: text("workflow_run_id"),
    modelo: text("modelo").notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    tokensCache: integer("tokens_cache").notNull().default(0),
    costo: doublePrecision("costo").notNull().default(0),
    estado: estadoEjecucionEnum("estado").notNull().default("pendiente"),
    resumen: text("resumen"),
    creadoEn: creadoEn(),
  },
  (t) => [
    index("ejecucion_org_tarea_idx").on(t.orgId, t.tareaId),
    // Destino de la FK compuesta (org_id, id) de aprobacion: impide cruzar organizaciones.
    unique("ejecucion_org_id_uq").on(t.orgId, t.id),
    foreignKey({
      name: "ejecucion_tarea_org_fk",
      columns: [t.orgId, t.tareaId],
      foreignColumns: [tarea.orgId, tarea.id],
    }),
  ],
);

export const aprobacion = pgTable(
  "aprobacion",
  {
    id: pk(),
    orgId: orgId(),
    ejecucionId: uuid("ejecucion_id").notNull(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").notNull(),
    riesgo: riesgoEnum("riesgo").notNull(),
    estado: estadoAprobacionEnum("estado").notNull().default("pendiente"),
    decididoPor: uuid("decidido_por").references(() => usuario.id),
    decididoEn: timestamp("decidido_en", { withTimezone: true }),
    expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("aprobacion_org_estado_idx").on(t.orgId, t.estado),
    // FK compuesta: la ejecucion referenciada debe ser de la misma organizacion.
    foreignKey({
      name: "aprobacion_ejecucion_org_fk",
      columns: [t.orgId, t.ejecucionId],
      foreignColumns: [ejecucion.orgId, ejecucion.id],
    }),
  ],
);

// Append-only, encadenada por HMAC-SHA256 (clave AUDIT_HMAC_KEY fuera de la BD).
// Endurecimiento (REVOKE UPDATE/DELETE, pg_advisory_xact_lock por org, triggers y RLS):
// ver src/core/db/sql/0001_auditoria_endurecimiento.sql (se aplica tras src/core/db/migrations;
// verificado en PGlite por tests/integration/db).
export const auditoria = pgTable(
  "auditoria",
  {
    id: pk(),
    orgId: orgId(),
    /** Posicion en la cadena de la organizacion, desde 1. */
    seq: integer("seq").notNull(),
    actor: text("actor").notNull(),
    accion: text("accion").notNull(),
    entidad: text("entidad").notNull(),
    antes: jsonb("antes"),
    despues: jsonb("despues"),
    hashPrev: text("hash_prev"),
    /** HMAC-SHA256 hex del contenido canonico (incluye seq y hash_prev). */
    hash: text("hash").notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [
    index("auditoria_org_idx").on(t.orgId, t.creadoEn),
    unique("auditoria_org_seq_uq").on(t.orgId, t.seq),
  ],
);

// Artefactos de texto de los agentes (viajan por referencia, nunca por transcripcion).
export const artefacto = pgTable(
  "artefacto",
  {
    id: pk(),
    orgId: orgId(),
    /** artefacto://<org>/<tarea>/<hash>: direccionado por contenido. */
    ref: text("ref").notNull(),
    proyectoId: uuid("proyecto_id").notNull(),
    tareaId: uuid("tarea_id").notNull(),
    tipo: text("tipo").notNull(),
    contenido: text("contenido").notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [unique("artefacto_org_ref_uq").on(t.orgId, t.ref)],
);

// Sala de operaciones: metadatos de la operacion; los pasos viven en evento_traza.
export const operacion = pgTable(
  "operacion",
  {
    id: uuid("id").primaryKey(),
    orgId: orgId(),
    /** Identidad de quien la encargo (texto: admite tambien identidades de servicio). */
    usuarioId: text("usuario_id").notNull(),
    texto: text("texto").notNull(),
    idioma: text("idioma").notNull(),
    estado: text("estado").notNull(),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull(),
    /** Ultima secuencia asignada: UPDATE ... + 1 RETURNING da secuencias contiguas. */
    ultimaSecuencia: integer("ultima_secuencia").notNull().default(0),
  },
  (t) => [
    index("operacion_org_creada_idx").on(t.orgId, t.creadaEn),
    unique("operacion_org_id_uq").on(t.orgId, t.id),
  ],
);

// Traza (EventoTraza de src/orchestration/traza/eventos.ts): append-only salvo la retencion.
export const eventoTraza = pgTable(
  "evento_traza",
  {
    id: uuid("id").primaryKey(),
    orgId: orgId(),
    operacionId: uuid("operacion_id").notNull(),
    secuencia: integer("secuencia").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    tipo: text("tipo").notNull(),
    agenteId: text("agente_id"),
    haciaAgenteId: text("hacia_agente_id"),
    ejecucionId: text("ejecucion_id"),
    padreEjecucionId: text("padre_ejecucion_id"),
    titulo: text("titulo").notNull(),
    detalle: jsonb("detalle"),
    estado: text("estado"),
    tokens: jsonb("tokens"),
  },
  (t) => [
    // Su indice unico es tambien el de lectura por (operacion_id, secuencia).
    unique("evento_traza_operacion_secuencia_uq").on(t.operacionId, t.secuencia),
    // Retencion: purgarEventosAntiguos borra por antiguedad.
    index("evento_traza_ts_idx").on(t.ts),
    foreignKey({
      name: "evento_traza_operacion_org_fk",
      columns: [t.orgId, t.operacionId],
      foreignColumns: [operacion.orgId, operacion.id],
    }).onDelete("cascade"),
  ],
);

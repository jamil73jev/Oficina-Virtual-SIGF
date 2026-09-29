CREATE TYPE "public"."ambito_presupuesto" AS ENUM('org', 'proyecto', 'agente');--> statement-breakpoint
CREATE TYPE "public"."autor_tipo" AS ENUM('humano', 'agente');--> statement-breakpoint
CREATE TYPE "public"."estado_agente" AS ENUM('activo', 'inactivo', 'pausado');--> statement-breakpoint
CREATE TYPE "public"."estado_aprobacion" AS ENUM('pendiente', 'aprobada', 'rechazada', 'expirada');--> statement-breakpoint
CREATE TYPE "public"."estado_ejecucion" AS ENUM('pendiente', 'en_curso', 'pausada', 'completada', 'fallida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."estado_proyecto" AS ENUM('borrador', 'activo', 'pausado', 'completado', 'archivado');--> statement-breakpoint
CREATE TYPE "public"."estado_solicitud_ampliacion" AS ENUM('pendiente', 'aprobada', 'rechazada');--> statement-breakpoint
CREATE TYPE "public"."estado_tarea" AS ENUM('pendiente', 'asignada', 'en_curso', 'en_verificacion', 'completada', 'fallida', 'bloqueada');--> statement-breakpoint
CREATE TYPE "public"."riesgo" AS ENUM('lectura', 'escritura_reversible', 'irreversible');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('owner', 'admin', 'supervisor', 'viewer');--> statement-breakpoint
CREATE TABLE "agente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"rol" text NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"herramientas_permitidas" text[] DEFAULT '{}'::text[] NOT NULL,
	"modelo" text NOT NULL,
	"presupuesto_id" uuid,
	"estado" "estado_agente" DEFAULT 'activo' NOT NULL,
	"prompt_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aprobacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ejecucion_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"payload" jsonb NOT NULL,
	"riesgo" "riesgo" NOT NULL,
	"estado" "estado_aprobacion" DEFAULT 'pendiente' NOT NULL,
	"decidido_por" uuid,
	"decidido_en" timestamp with time zone,
	"expira_en" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"actor" text NOT NULL,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"antes" jsonb,
	"despues" jsonb,
	"hash_prev" text,
	"hash" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auditoria_org_seq_uq" UNIQUE("org_id","seq")
);
--> statement-breakpoint
CREATE TABLE "documento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"tarea_id" uuid,
	"blob_url" text NOT NULL,
	"hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"tipo" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ejecucion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tarea_id" uuid NOT NULL,
	"agente_id" uuid NOT NULL,
	"padre_ejecucion_id" uuid,
	"workflow_run_id" text,
	"modelo" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"tokens_cache" integer DEFAULT 0 NOT NULL,
	"costo" double precision DEFAULT 0 NOT NULL,
	"estado" "estado_ejecucion" DEFAULT 'pendiente' NOT NULL,
	"resumen" text,
	CONSTRAINT "ejecucion_org_id_uq" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "membresia" (
	"usuario_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"rol" "rol" NOT NULL,
	CONSTRAINT "membresia_usuario_id_org_id_pk" PRIMARY KEY("usuario_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "mensaje" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"hilo" text NOT NULL,
	"autor_tipo" "autor_tipo" NOT NULL,
	"autor_id" uuid NOT NULL,
	"contenido" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"huso" text NOT NULL,
	"moneda" text NOT NULL,
	"locale" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presupuesto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ambito" "ambito_presupuesto" NOT NULL,
	"ref_id" uuid NOT NULL,
	"tope_tokens" integer NOT NULL,
	"tope_costo" double precision NOT NULL,
	"tope_iteraciones" integer NOT NULL,
	"consumido_tokens" integer DEFAULT 0 NOT NULL,
	"consumido_costo" double precision DEFAULT 0 NOT NULL,
	"consumido_iteraciones" integer DEFAULT 0 NOT NULL,
	"periodo" text NOT NULL,
	CONSTRAINT "presupuesto_org_ambito_ref_uq" UNIQUE("org_id","ambito","ref_id")
);
--> statement-breakpoint
CREATE TABLE "proyecto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"objetivo" text NOT NULL,
	"estado" "estado_proyecto" DEFAULT 'borrador' NOT NULL,
	"presupuesto_id" uuid,
	"owner_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitud_ampliacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"claves" jsonb NOT NULL,
	"estimado" jsonb NOT NULL,
	"estado" "estado_solicitud_ampliacion" DEFAULT 'pendiente' NOT NULL,
	"decidido_por" text,
	"creada_en" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tarea" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"padre_id" uuid,
	"agente_id" uuid,
	"estado" "estado_tarea" DEFAULT 'pendiente' NOT NULL,
	"criterios_verificacion" text[] DEFAULT '{}'::text[] NOT NULL,
	"deps" uuid[] DEFAULT '{}'::uuid[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"mfa" boolean DEFAULT false NOT NULL,
	CONSTRAINT "usuario_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agente" ADD CONSTRAINT "agente_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agente" ADD CONSTRAINT "agente_presupuesto_id_presupuesto_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuesto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aprobacion" ADD CONSTRAINT "aprobacion_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aprobacion" ADD CONSTRAINT "aprobacion_decidido_por_usuario_id_fk" FOREIGN KEY ("decidido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aprobacion" ADD CONSTRAINT "aprobacion_ejecucion_org_fk" FOREIGN KEY ("org_id","ejecucion_id") REFERENCES "public"."ejecucion"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_proyecto_id_proyecto_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."proyecto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_tarea_id_tarea_id_fk" FOREIGN KEY ("tarea_id") REFERENCES "public"."tarea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejecucion" ADD CONSTRAINT "ejecucion_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejecucion" ADD CONSTRAINT "ejecucion_tarea_id_tarea_id_fk" FOREIGN KEY ("tarea_id") REFERENCES "public"."tarea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejecucion" ADD CONSTRAINT "ejecucion_agente_id_agente_id_fk" FOREIGN KEY ("agente_id") REFERENCES "public"."agente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_proyecto_id_proyecto_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."proyecto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto" ADD CONSTRAINT "presupuesto_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_presupuesto_id_presupuesto_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuesto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_owner_id_usuario_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitud_ampliacion" ADD CONSTRAINT "solicitud_ampliacion_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_proyecto_id_proyecto_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."proyecto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_agente_id_agente_id_fk" FOREIGN KEY ("agente_id") REFERENCES "public"."agente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agente_org_idx" ON "agente" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "aprobacion_org_estado_idx" ON "aprobacion" USING btree ("org_id","estado");--> statement-breakpoint
CREATE INDEX "auditoria_org_idx" ON "auditoria" USING btree ("org_id","creado_en");--> statement-breakpoint
CREATE INDEX "documento_org_proyecto_idx" ON "documento" USING btree ("org_id","proyecto_id");--> statement-breakpoint
CREATE INDEX "ejecucion_org_tarea_idx" ON "ejecucion" USING btree ("org_id","tarea_id");--> statement-breakpoint
CREATE INDEX "mensaje_org_proyecto_hilo_idx" ON "mensaje" USING btree ("org_id","proyecto_id","hilo");--> statement-breakpoint
CREATE INDEX "presupuesto_org_idx" ON "presupuesto" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "proyecto_org_idx" ON "proyecto" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "solicitud_ampliacion_org_estado_idx" ON "solicitud_ampliacion" USING btree ("org_id","estado");--> statement-breakpoint
CREATE INDEX "tarea_org_proyecto_idx" ON "tarea" USING btree ("org_id","proyecto_id");
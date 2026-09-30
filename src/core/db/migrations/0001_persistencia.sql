CREATE TABLE "artefacto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"tarea_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"contenido" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artefacto_org_ref_uq" UNIQUE("org_id","ref")
);
--> statement-breakpoint
CREATE TABLE "documento_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"documento_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"tarea_id" uuid,
	"blob_url" text NOT NULL,
	"hash" text NOT NULL,
	"tipo" text NOT NULL,
	"nombre" text NOT NULL,
	"tamano" integer NOT NULL,
	"creado_en" timestamp with time zone NOT NULL,
	"creado_por" text NOT NULL,
	CONSTRAINT "documento_version_doc_version_uq" UNIQUE("documento_id","version")
);
--> statement-breakpoint
CREATE TABLE "evento_traza" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"operacion_id" uuid NOT NULL,
	"secuencia" integer NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"tipo" text NOT NULL,
	"agente_id" text,
	"hacia_agente_id" text,
	"ejecucion_id" text,
	"padre_ejecucion_id" text,
	"titulo" text NOT NULL,
	"detalle" jsonb,
	"estado" text,
	"tokens" jsonb,
	CONSTRAINT "evento_traza_operacion_secuencia_uq" UNIQUE("operacion_id","secuencia")
);
--> statement-breakpoint
CREATE TABLE "operacion" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"usuario_id" text NOT NULL,
	"texto" text NOT NULL,
	"idioma" text NOT NULL,
	"estado" text NOT NULL,
	"creada_en" timestamp with time zone NOT NULL,
	"ultima_secuencia" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "operacion_org_id_uq" UNIQUE("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "documento" DROP CONSTRAINT "documento_proyecto_id_proyecto_id_fk";
--> statement-breakpoint
ALTER TABLE "documento" DROP CONSTRAINT "documento_tarea_id_tarea_id_fk";
--> statement-breakpoint
ALTER TABLE "ejecucion" DROP CONSTRAINT "ejecucion_tarea_id_tarea_id_fk";
--> statement-breakpoint
ALTER TABLE "ejecucion" DROP CONSTRAINT "ejecucion_agente_id_agente_id_fk";
--> statement-breakpoint
ALTER TABLE "tarea" DROP CONSTRAINT "tarea_proyecto_id_proyecto_id_fk";
--> statement-breakpoint
ALTER TABLE "tarea" DROP CONSTRAINT "tarea_agente_id_agente_id_fk";
--> statement-breakpoint
ALTER TABLE "documento" ADD COLUMN "nombre" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ejecucion" ADD COLUMN "creado_en" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tarea" ADD COLUMN "titulo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tarea" ADD COLUMN "descripcion" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tarea" ADD COLUMN "rol_agente" text;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_org_id_uq" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_org_id_uq" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_org_id_uq" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "artefacto" ADD CONSTRAINT "artefacto_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_version" ADD CONSTRAINT "documento_version_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_version" ADD CONSTRAINT "documento_version_documento_org_fk" FOREIGN KEY ("org_id","documento_id") REFERENCES "public"."documento"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_traza" ADD CONSTRAINT "evento_traza_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_traza" ADD CONSTRAINT "evento_traza_operacion_org_fk" FOREIGN KEY ("org_id","operacion_id") REFERENCES "public"."operacion"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_org_id_organizacion_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evento_traza_ts_idx" ON "evento_traza" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "operacion_org_creada_idx" ON "operacion" USING btree ("org_id","creada_en");--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_proyecto_org_fk" FOREIGN KEY ("org_id","proyecto_id") REFERENCES "public"."proyecto"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_tarea_org_fk" FOREIGN KEY ("org_id","tarea_id") REFERENCES "public"."tarea"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejecucion" ADD CONSTRAINT "ejecucion_tarea_org_fk" FOREIGN KEY ("org_id","tarea_id") REFERENCES "public"."tarea"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documento_org_tarea_idx" ON "documento" USING btree ("org_id","tarea_id");--> statement-breakpoint

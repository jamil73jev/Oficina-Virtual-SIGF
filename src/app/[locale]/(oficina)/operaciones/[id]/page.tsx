import { SalaOperacion } from "@/modules/operaciones-ui/SalaOperacion";
import type { IdiomaOperaciones } from "@/modules/operaciones-ui/mensajes";
import { AGENTES_AREA } from "@/modules/agentes-area/catalogo";
import { exigirIdentidadPagina } from "@/core/auth/pagina";

export default async function OperacionPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const idioma: IdiomaOperaciones = locale === "en" ? "en" : "es";
  await exigirIdentidadPagina(idioma);
  const agentes = AGENTES_AREA.map(({ id: agenteId, nombre }) => ({ id: agenteId, nombre }));
  return <SalaOperacion operacionId={id} idioma={idioma} agentes={agentes} />;
}

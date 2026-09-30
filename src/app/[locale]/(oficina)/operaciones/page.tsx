import { FormularioOperacion } from "@/modules/operaciones-ui/FormularioOperacion";
import type { IdiomaOperaciones } from "@/modules/operaciones-ui/mensajes";
import { exigirIdentidadPagina } from "@/core/auth/pagina";

export default async function OperacionesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const idioma: IdiomaOperaciones = locale === "en" ? "en" : "es";
  await exigirIdentidadPagina(idioma);
  return <FormularioOperacion idioma={idioma} />;
}

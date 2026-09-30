import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { isLocale } from "@/core/i18n/config";
import { ListaDocumentos } from "@/modules/documentos/ListaDocumentos";
import { mensajesDocumentos, type LocaleDocumentos } from "@/modules/documentos/mensajes";

export default async function DocumentosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !(locale in mensajesDocumentos)) notFound();
  setRequestLocale(locale);
  const idioma = locale as LocaleDocumentos;
  const t = mensajesDocumentos[idioma];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader id="titulo-documentos" title={t.titulo} subtitle={t.subtitulo} />
      <section aria-labelledby="lista-documentos">
        <h2 id="lista-documentos" className="sr-only">{t.lista}</h2>
        <ListaDocumentos documentos={[]} locale={idioma} />
      </section>
    </div>
  );
}


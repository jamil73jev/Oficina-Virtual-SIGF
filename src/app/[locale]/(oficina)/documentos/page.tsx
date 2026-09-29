import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
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
    <main className="mx-auto flex max-w-4xl flex-col gap-6" aria-labelledby="titulo-documentos">
      <header>
        <h1 id="titulo-documentos" className="text-2xl font-bold">{t.titulo}</h1>
        <p className="text-muted">{t.subtitulo}</p>
      </header>
      <section aria-labelledby="lista-documentos">
        <h2 id="lista-documentos" className="sr-only">{t.lista}</h2>
        <ListaDocumentos documentos={[]} locale={idioma} />
      </section>
    </main>
  );
}


import { Badge, Card, CardTitle } from "@/components/ui";
import type { DocumentoConVersiones } from "./domain";
import type { LocaleDocumentos } from "./mensajes";
import { mensajesDocumentos } from "./mensajes";

export function ListaDocumentos({
  documentos,
  locale,
}: {
  documentos: readonly DocumentoConVersiones[];
  locale: LocaleDocumentos;
}) {
  const t = mensajesDocumentos[locale];
  if (documentos.length === 0) {
    return <p role="status" className="rounded-lg border border-subtle p-6 text-muted">{t.vacio}</p>;
  }
  return (
    <ul aria-label={t.lista} className="grid gap-4">
      {documentos.map((documento) => (
        <li key={documento.id}>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{documento.nombre}</CardTitle>
              <Badge>{documento.tipo}</Badge>
            </div>
            <h3 className="mt-4 text-sm font-semibold">{t.versiones}</h3>
            <ol className="mt-2 space-y-2">
              {documento.versiones.map((version) => (
                <li key={version.version} className="flex flex-wrap justify-between gap-2 border-t border-subtle pt-2 text-sm">
                  <span>{t.version} {version.version}</span>
                  <span className="text-muted">SHA-256 <code>{version.hash.slice(0, 12)}…</code></span>
                </li>
              ))}
            </ol>
          </Card>
        </li>
      ))}
    </ul>
  );
}


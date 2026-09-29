export const mensajesDocumentos = {
  es: {
    titulo: "Documentos",
    subtitulo: "Archivos y artefactos del proyecto, conservados por versión.",
    lista: "Lista de documentos",
    vacio: "Todavía no hay documentos.",
    versiones: "Versiones",
    version: "Versión",
  },
  en: {
    titulo: "Documents",
    subtitulo: "Project files and artifacts, preserved by version.",
    lista: "Document list",
    vacio: "There are no documents yet.",
    versiones: "Versions",
    version: "Version",
  },
} as const;

export type LocaleDocumentos = keyof typeof mensajesDocumentos;


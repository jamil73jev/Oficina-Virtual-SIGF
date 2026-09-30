// Migrador reproducible de la oficina. Nunca muestra la URL ni errores de conexion completos.
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";

const DIRECTORIOS = [
  ["migrations", fileURLToPath(new URL("../src/core/db/migrations/", import.meta.url))],
  ["sql", fileURLToPath(new URL("../src/core/db/sql/", import.meta.url))],
];
const TABLA = "_oficina_migraciones";

export async function descubrirMigraciones() {
  const salida = [];
  for (const [grupo, directorio] of DIRECTORIOS) {
    const nombres = (await readdir(directorio)).filter((nombre) => nombre.endsWith(".sql")).sort();
    for (const nombre of nombres) {
      salida.push({ nombre: `${grupo}/${nombre}`, sql: await readFile(`${directorio}/${nombre}`, "utf8") });
    }
  }
  return salida;
}

/** Puerto minimo compartido por postgres-js y PGlite en la prueba de extremo a extremo. */
export async function aplicarMigraciones(ejecutor, migraciones) {
  migraciones ??= await descubrirMigraciones();
  await ejecutor.preparar();
  const aplicadas = new Set(await ejecutor.aplicadas());
  const nuevas = [];
  for (const migracion of migraciones) {
    if (aplicadas.has(migracion.nombre)) continue;
    await ejecutor.transaccion(async (tx) => {
      await tx.ejecutar(migracion.sql);
      await tx.registrar(migracion.nombre);
    });
    nuevas.push(migracion.nombre);
  }
  return nuevas;
}

export function crearEjecutorPostgres(sql) {
  return {
    preparar: () => sql.unsafe(`
      create table if not exists ${TABLA} (
        nombre text primary key,
        aplicada_en timestamptz not null default now()
      )`),
    aplicadas: async () => (await sql.unsafe(`select nombre from ${TABLA} order by nombre`)).map((fila) => fila.nombre),
    transaccion: (fn) => sql.begin((tx) => fn({
      ejecutar: (texto) => tx.unsafe(texto),
      registrar: (nombre) => tx.unsafe(`insert into ${TABLA} (nombre) values ($1)`, [nombre]),
    })),
  };
}

async function principal() {
  const migraciones = await descubrirMigraciones();
  if (process.argv.includes("--simular")) {
    console.log("Simulacion; se aplicarian en este orden:");
    for (const { nombre } of migraciones) console.log(`- ${nombre}`);
    return;
  }

  const url = process.env.DATABASE_URL_MIGRACIONES?.trim() || process.env.DATABASE_URL_DIRECT?.trim();
  if (!url) throw new Error("Falta DATABASE_URL_MIGRACIONES o DATABASE_URL_DIRECT");
  const local = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);
  const sql = postgres(url, { max: 1, prepare: false, ssl: local ? false : "require", onnotice: () => {} });
  try {
    const nuevas = await aplicarMigraciones(crearEjecutorPostgres(sql), migraciones);
    if (nuevas.length === 0) console.log("Base al dia; no hay migraciones pendientes.");
    else for (const nombre of nuevas) console.log(`Aplicada: ${nombre}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const invocadoDirectamente = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invocadoDirectamente) {
  principal().catch((error) => {
    // No se imprime error.message: un driver puede incluir host, usuario o cadena de conexion.
    const tipo = error instanceof Error ? error.name : "Error";
    console.error(`La migracion fallo (${tipo}). Revise la configuracion y los registros seguros.`);
    process.exitCode = 1;
  });
}

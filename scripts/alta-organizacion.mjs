// Alta (idempotente) de una organizacion y de la membresia OWNER de un usuario que YA existe
// en Supabase Auth. Uso (PowerShell o bash, con las variables en el entorno, nunca en el repo):
//
//   node scripts/alta-organizacion.mjs --correo analista@ejemplo.ec --org "Oficina del analista"
//     [--huso America/Guayaquil] [--moneda USD] [--locale es]
//
// Variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (solo aqui, jamas en la app ni con prefijo
// NEXT_PUBLIC) y DATABASE_URL_DIRECT (conexion directa, puerto 5432). No imprime secretos:
// solo ids, el correo indicado y lo que se creo o ya existia.
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const salir = (mensaje, codigo = 1) => {
  console.error(mensaje);
  process.exit(codigo);
};

const { values } = parseArgs({
  options: {
    correo: { type: "string" },
    org: { type: "string" },
    huso: { type: "string", default: "America/Guayaquil" },
    moneda: { type: "string", default: "USD" },
    locale: { type: "string", default: "es" },
  },
});

const correo = values.correo?.trim().toLowerCase();
const nombreOrg = values.org?.trim();
if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) salir("Falta --correo (correo valido).");
if (!nombreOrg) salir('Falta --org "Nombre de la organizacion".');
if (!["es", "en"].includes(values.locale)) salir("--locale debe ser es o en.");
if (!/^[A-Z]{3}$/.test(values.moneda)) salir("--moneda debe ser un codigo ISO de 3 letras (p. ej. USD).");

const faltan = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL_DIRECT"].filter(
  (v) => !process.env[v]?.trim(),
);
if (faltan.length) salir(`Faltan variables de entorno: ${faltan.join(", ")}`);

/** Error propio: su mensaje no contiene secretos y se puede mostrar. */
class ErrorAlta extends Error {}

/** Busca el usuario por correo con la API de administracion (paginada). */
async function buscarUsuarioAuth(correoBuscado) {
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const porPagina = 200;
  for (let pagina = 1; pagina <= 50; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: porPagina });
    if (error) throw new ErrorAlta(`Supabase Auth respondio con error (${error.status ?? "sin estado"})`);
    const u = data.users.find((x) => x.email?.toLowerCase() === correoBuscado);
    if (u) return u;
    if (data.users.length < porPagina) return null;
  }
  return null;
}

let sql;
try {
  const usuarioAuth = await buscarUsuarioAuth(correo);
  if (!usuarioAuth) {
    salir(`No existe en Supabase Auth un usuario con el correo ${correo}. Crealo primero en el panel (Authentication > Users).`);
  }
  const mfa = (usuarioAuth.factors ?? []).some((f) => f.status === "verified");

  const url = process.env.DATABASE_URL_DIRECT.trim();
  const local = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);
  sql = postgres(url, { max: 1, prepare: false, ssl: local ? false : "require", onnotice: () => {} });

  const resultado = await sql.begin(async (tx) => {
    // Usuario del catalogo con el MISMO id que en Supabase Auth.
    const [usuario] = await tx`
      insert into usuario (id, email, mfa) values (${usuarioAuth.id}, ${correo}, ${mfa})
      on conflict (id) do update set email = excluded.email, mfa = excluded.mfa
      returning id`;

    // Organizacion: se reutiliza la del mismo nombre donde el usuario ya es owner; si no, la
    // primera con ese nombre; si no existe, se crea.
    const existentes = await tx`
      select o.id, (m.usuario_id is not null) as es_owner
      from organizacion o
      left join membresia m on m.org_id = o.id and m.usuario_id = ${usuario.id} and m.rol = 'owner'
      where o.nombre = ${nombreOrg}
      order by es_owner desc, o.id asc
      limit 1`;
    let orgId = existentes[0]?.id;
    const orgCreada = !orgId;
    if (!orgId) {
      const [org] = await tx`
        insert into organizacion (nombre, huso, moneda, locale)
        values (${nombreOrg}, ${values.huso}, ${values.moneda}, ${values.locale})
        returning id`;
      orgId = org.id;
    }

    const [membresia] = await tx`
      insert into membresia (usuario_id, org_id, rol) values (${usuario.id}, ${orgId}, 'owner')
      on conflict (usuario_id, org_id) do update set rol = 'owner'
      returning (xmax = 0) as creada`;

    return { usuarioId: usuario.id, orgId, orgCreada, membresiaCreada: membresia.creada };
  });

  console.log(`Usuario: ${resultado.usuarioId} (${correo})`);
  console.log(`Organizacion: ${resultado.orgId} (${resultado.orgCreada ? "creada" : "ya existia"})`);
  console.log(`Membresia owner: ${resultado.membresiaCreada ? "creada" : "ya existia (rol owner asegurado)"}`);
} catch (e) {
  // Solo el tipo y el codigo: los mensajes de conexion pueden incluir el host o el usuario.
  const codigo = e && typeof e === "object" && "code" in e ? ` [${e.code}]` : "";
  const detalle = e instanceof ErrorAlta ? e.message : e instanceof Error ? e.name : "desconocido";
  salir(`Error en el alta${codigo}: ${detalle}`);
} finally {
  await sql?.end({ timeout: 5 });
}

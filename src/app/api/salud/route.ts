/**
 * Comprobacion de vida para monitores externos. Publica a proposito y sin tocar la base de
 * datos ni revelar version, entorno ni configuracion: solo dice que la aplicacion responde.
 */
export const GET = () =>
  Response.json({ estado: "ok" }, { headers: { "Cache-Control": "no-store" } });

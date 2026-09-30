import { crearManejadorMantenimiento } from "@/modules/mantenimiento";

/** Cron diario de Vercel (ver vercel.json): actividad en la base y retencion de la traza. */
export const GET = (req: Request) => crearManejadorMantenimiento()(req);

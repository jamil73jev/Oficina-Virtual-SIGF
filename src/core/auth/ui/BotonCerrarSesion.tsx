import { Button } from "@/components/ui/Button";
import { cerrarSesion } from "../acciones";
import { mensajesAuth, type LocaleAuth } from "../mensajes";

/** Formulario de cierre de sesion (accion de servidor; funciona sin JavaScript). */
export function BotonCerrarSesion({ locale, className }: { locale: LocaleAuth; className?: string }) {
  return (
    <form action={cerrarSesion} className={className}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="secondary">
        {mensajesAuth[locale].menu.cerrarSesion}
      </Button>
    </form>
  );
}

import { describe, expect, it } from "vitest";
import { crearManejadorEstadoModeloLocal } from "@/modules/agentes-ui";
import { mensajesAgentes } from "@/modules/agentes-ui/mensajes";
import { ModeloSimulado, type ModeloLenguaje } from "@/orchestration/runtime/modelo";

const simulado = new ModeloSimulado();
const modeloNubeFalso: ModeloLenguaje = {
  id: "gateway:prueba/gratis",
  alojamiento: "nube",
  generarTexto: (peticion) => simulado.generarTexto(peticion),
  generarObjeto: (peticion) => simulado.generarObjeto(peticion),
};

describe("estado del modelo de nube en agentes", () => {
  it("informa alojamiento y restricción sin credenciales", async () => {
    const respuesta = await crearManejadorEstadoModeloLocal(() => modeloNubeFalso)();
    expect(await respuesta.json()).toEqual({
      configurado: true,
      disponible: true,
      modelo: "gateway:prueba/gratis",
      alojamiento: "nube",
      soloDatosSinteticos: true,
    });
  });

  it("mantiene las mismas claves ES/EN y el aviso visible", () => {
    expect(Object.keys(mensajesAgentes.es).sort()).toEqual(Object.keys(mensajesAgentes.en).sort());
    expect(mensajesAgentes.es.modeloNubeDisponible).toContain("sintéticos");
    expect(mensajesAgentes.en.modeloNubeDisponible).toContain("synthetic");
  });
});

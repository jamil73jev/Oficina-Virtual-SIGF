"use client";

import { useEffect, useState } from "react";
import { ConexionOperacion, type VistaConexionOperacion } from "./conexion";
import { estadoInicialOperacion } from "./estado";

export function useOperacion(operacionId: string) {
  const [vista, setVista] = useState<VistaConexionOperacion>({
    ...estadoInicialOperacion, cargando: true, error: null, conexion: "reconectando",
  });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const conexion = new ConexionOperacion(operacionId, setVista);
    void conexion.iniciar();
    return () => conexion.detener();
  }, [operacionId, version]);
  return { ...vista, reintentar: () => setVersion((actual) => actual + 1) };
}

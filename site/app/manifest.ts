import { PERFIL } from "@/lib/gerado/perfil";
import type { MetadataRoute } from "next";

// Permite "Adicionar à tela inicial" no celular: abre como app, sem a barra do navegador.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "busca_vagas",
    short_name: "Vagas",
    description: `Radar pessoal de vagas ${PERFIL.area}`,
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f8",
    theme_color: "#1f6f78",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

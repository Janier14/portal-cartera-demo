import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Demo Operativa",
    short_name: "Demo",
    description: "Caso de estudio demo para portafolio",
    start_url: "/resumen",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5F0E8",
    theme_color: "#D32F2F",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}

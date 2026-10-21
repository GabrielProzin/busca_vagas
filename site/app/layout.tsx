import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "busca_vagas",
  description: "Radar pessoal de vagas júnior de dados",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wdth,wght@75..100,400..700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

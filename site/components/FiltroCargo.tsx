"use client";

import { useRouter } from "next/navigation";
import Seletor from "./Seletor";

// Seletor de cargo da lista de vagas: troca o filtro na URL assim que você escolhe.
export default function FiltroCargo({ trilhas, atual, base }: { trilhas: string[]; atual: string; base: Record<string, string> }) {
  const router = useRouter();
  return (
    <Seletor
      prefixo="Cargo"
      rotuloAcessivel="Filtrar por cargo"
      valor={atual}
      opcoes={[{ valor: "", rotulo: "Todos" }, ...trilhas.map((t) => ({ valor: t, rotulo: t }))]}
      onEscolher={(v) => {
        const p = new URLSearchParams(base);
        if (v) p.set("trilha", v);
        else p.delete("trilha");
        const s = p.toString();
        router.push(s ? `/vagas?${s}` : "/vagas");
      }}
    />
  );
}

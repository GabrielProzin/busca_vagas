"use client";

import { useRouter } from "next/navigation";

// Seletor de cargo da lista de vagas: troca o filtro na URL assim que você escolhe.
export default function FiltroCargo({ trilhas, atual, base }: { trilhas: string[]; atual: string; base: Record<string, string> }) {
  const router = useRouter();
  return (
    <label className="filtro-select">
      <span>Cargo</span>
      <select
        value={atual}
        aria-label="Filtrar por cargo"
        onChange={(e) => {
          const p = new URLSearchParams(base);
          if (e.target.value) p.set("trilha", e.target.value);
          else p.delete("trilha");
          const s = p.toString();
          router.push(s ? `/?${s}` : "/");
        }}
      >
        <option value="">Todos</option>
        {trilhas.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </label>
  );
}

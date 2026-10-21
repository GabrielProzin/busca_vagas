import type { Vaga } from "./tipos";

const MODALIDADE: Record<string, string> = { remoto: "Remoto", hibrido: "Híbrido", presencial: "Presencial" };

export function local(v: Pick<Vaga, "modalidade" | "cidade" | "estado">): string {
  const m = v.modalidade ? MODALIDADE[v.modalidade] ?? v.modalidade : "Local não informado";
  if (v.modalidade === "remoto" || !v.cidade) return m;
  return `${m} em ${v.cidade}`;
}

export function fonte(f: string): string {
  return { gupy: "Gupy", remotar: "Remotar", github: "GitHub", linkedin: "LinkedIn" }[f] ?? f;
}

export function quando(iso: string | null): string {
  if (!iso) return "";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

export function habilidade(h: string): string {
  return h.replace(/_/g, " ").replace(/\bpower bi\b/i, "Power BI").replace(/\bsql\b/i, "SQL").replace(/\betl\b/i, "ETL")
    .replace(/\bdax\b/i, "DAX").replace(/\bapis\b/i, "APIs").replace(/\bllm\b/i, "LLM").replace(/^\w/, (c) => c.toUpperCase());
}

export function idUrl(id: string): string {
  return `/vaga/${encodeURIComponent(id)}`;
}

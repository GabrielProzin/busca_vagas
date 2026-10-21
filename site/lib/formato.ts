import type { Vaga } from "./tipos";

const MODALIDADE: Record<string, string> = { remoto: "Remoto", hibrido: "Híbrido", presencial: "Presencial" };

export function local(v: Pick<Vaga, "modalidade" | "cidade" | "estado">): string {
  const m = v.modalidade ? MODALIDADE[v.modalidade] ?? v.modalidade : "Local não informado";
  if (v.modalidade === "remoto" || !v.cidade) return m;
  return `${m} em ${v.cidade}`;
}

export function fonte(f: string): string {
  return { gupy: "Gupy", remotar: "Remotar", solides: "Sólides", github: "GitHub", linkedin: "LinkedIn", manual: "Adicionada por você" }[f] ?? f;
}

/** "na Gupy", "no GitHub", "no LinkedIn"… para o botão de abrir a vaga. */
export function naFonte(f: string): string {
  return { gupy: "na Gupy", remotar: "na Remotar", solides: "na Sólides", github: "no GitHub", linkedin: "no LinkedIn" }[f] ?? "no site original";
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

/** Texto curto sobre de onde veio o email do recrutador. */
export function origemEmail(origem: string | null | undefined): string {
  if (origem === "site_rh") return "Email de RH do site da empresa";
  if (origem === "site_contato") return "Contato geral do site da empresa";
  return "Email do recrutador";
}

/** Minúsculo e sem acento, para a busca da lista. */
export function normalizarBusca(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

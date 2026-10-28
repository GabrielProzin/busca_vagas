import { PERFIL } from "./gerado/perfil";
import type { CriterioCV, HabilidadeMercado } from "./tipos";

// Critérios da nota do currículo que não dependem de IA (docs/spec.md, "Análise de CV").
// Ficam aqui, separados da IA, para a nota ser explicável e igual para o mesmo texto.

export const PESOS = { mercado: 30, resultados: 25, estrutura: 20, escrita: 25 } as const;
export const ROTULOS: Record<CriterioCV["chave"], string> = {
  mercado: "Habilidades que o mercado pede",
  resultados: "Resultados com números",
  estrutura: "Estrutura e tamanho",
  escrita: "Clareza da escrita",
};

export const LIMITE_TEXTO = 15000;

/** Minúsculo e sem acento, como o coletor compara (coletor/texto.py). */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ");
}

const CATALOGO: [string, RegExp][] = Object.entries(PERFIL.catalogoHabilidades as Record<string, readonly string[]>).flatMap(([nome, padroes]) => {
  try {
    return [[nome, new RegExp(padroes.map((p) => normalizar(p)).join("|"), "i")] as [string, RegExp]];
  } catch {
    return [];
  }
});

/** Habilidades do catálogo que aparecem no texto. */
export function habilidadesNoTexto(texto: string): Set<string> {
  const t = normalizar(texto);
  return new Set(CATALOGO.filter(([, re]) => re.test(t)).map(([nome]) => nome));
}

const pct = (x: number) => `${Math.round(x)}%`;

/** 1. Habilidades que o mercado pede: % de vagas das 25 mais pedidas que aparecem no texto. */
function criterioMercado(texto: string, mercado: HabilidadeMercado[] | null): CriterioCV {
  const base = { chave: "mercado" as const, rotulo: ROTULOS.mercado, peso: PESOS.mercado };
  const top = (mercado ?? []).filter((h) => h.vagas > 0).sort((a, b) => b.pct - a.pct).slice(0, 25);
  if (!top.length) return { ...base, nota: null, motivo: "Ainda sem análise do mercado (sai na próxima coleta completa)." };
  const tem = habilidadesNoTexto(texto);
  const total = top.reduce((s, h) => s + h.pct, 0);
  const coberto = top.filter((h) => tem.has(h.nome));
  const nota = Math.round((coberto.reduce((s, h) => s + h.pct, 0) / total) * 100);
  const faltam = top.filter((h) => !tem.has(h.nome)).slice(0, 3).map((h) => `${h.nome} (${pct(h.pct)} das vagas)`);
  return {
    ...base, nota,
    motivo: `O texto mostra ${coberto.length} das ${top.length} habilidades mais pedidas.${faltam.length ? ` Mais pedidas que não aparecem: ${faltam.join(", ")}.` : ""}`,
  };
}

/** Seções do markdown: "## Experiência" -> linhas até a próxima "## ". */
function secoes(texto: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  let atual = "_topo";
  m.set(atual, []);
  for (const linha of texto.split(/\r?\n/)) {
    const h2 = linha.match(/^\s*##\s+(.+?)\s*$/);
    if (h2 && !linha.trim().startsWith("###")) {
      atual = normalizar(h2[1]);
      m.set(atual, []);
    } else m.get(atual)!.push(linha);
  }
  return m;
}

function achar(sec: Map<string, string[]>, ...nomes: string[]): string[] | null {
  for (const [k, v] of sec) if (nomes.some((n) => k.includes(n))) return v;
  return null;
}

const ehTopico = (l: string) => /^\s*([-*•]|\d+[.)])\s+/.test(l);

/** 2. Resultados com números: % dos tópicos de experiência e projetos que trazem algum número. */
function criterioResultados(texto: string): CriterioCV {
  const base = { chave: "resultados" as const, rotulo: ROTULOS.resultados, peso: PESOS.resultados };
  const sec = secoes(texto);
  const linhas = [...(achar(sec, "experiencia") ?? []), ...(achar(sec, "projeto") ?? [])];
  const topicos = (linhas.length ? linhas : texto.split(/\r?\n/)).filter(ehTopico);
  if (!topicos.length) return { ...base, nota: 0, motivo: "Não encontrei tópicos (linhas com “-”) nas experiências." };
  // Ano sozinho ("em 2025") não é resultado: só conta número que mede algo.
  const comNumero = topicos.filter((l) => /\d/.test(l.replace(/\b(19|20)\d{2}\b/g, ""))).length;
  const parte = comNumero / topicos.length;
  return {
    ...base, nota: Math.min(100, Math.round((parte / 0.6) * 100)),
    motivo: `${comNumero} de ${topicos.length} tópicos de experiência e projetos trazem números (${pct(parte * 100)}; 60% ou mais vale nota máxima).`,
  };
}

/** 3. Estrutura e tamanho: 5 conferências de 20 pontos. */
function criterioEstrutura(texto: string): CriterioCV {
  const base = { chave: "estrutura" as const, rotulo: ROTULOS.estrutura, peso: PESOS.estrutura };
  const sec = secoes(texto);
  const palavras = texto.split(/\s+/).filter((p) => /\p{L}/u.test(p)).length;
  const exp = achar(sec, "experiencia") ?? [];
  // Tópicos por experiência ("### Cargo" abre uma experiência).
  const porExp: number[] = [];
  for (const l of exp) {
    if (/^\s*###\s+/.test(l)) porExp.push(0);
    else if (ehTopico(l) && porExp.length) porExp[porExp.length - 1]++;
  }
  const checks: [boolean, string, string][] = [
    [Boolean(achar(sec, "resumo", "sobre", "perfil", "objetivo")), "tem resumo no topo", "falta um resumo no topo"],
    [Boolean(achar(sec, "experiencia")), "tem experiência", "falta a seção de experiência"],
    [Boolean(achar(sec, "formacao", "educacao")), "tem formação", "falta a seção de formação"],
    [palavras >= 300 && palavras <= 800, `${palavras} palavras (bom para 1 página)`, palavras < 300 ? `só ${palavras} palavras (curto)` : `${palavras} palavras (longo para 1 página)`],
    [porExp.length > 0 && porExp.every((n) => n >= 2 && n <= 6), "2 a 6 tópicos por experiência", porExp.length ? "alguma experiência tem menos de 2 ou mais de 6 tópicos" : "experiências sem tópicos"],
  ];
  const ok = checks.filter(([c]) => c);
  const faltas = checks.filter(([c]) => !c).map(([, , f]) => f);
  return {
    ...base, nota: ok.length * 20,
    motivo: faltas.length ? `${ok.length} de 5 conferências ok. ${faltas.join("; ").replace(/^./, (c) => c.toUpperCase())}.` : "Resumo, experiência, formação, tamanho e tópicos estão no ponto.",
  };
}

export function criteriosSemIA(texto: string, mercado: HabilidadeMercado[] | null): CriterioCV[] {
  return [criterioMercado(texto, mercado), criterioResultados(texto), criterioEstrutura(texto)];
}

/** Média ponderada só dos critérios com nota (os de fora redistribuem o peso). */
export function notaFinal(criterios: CriterioCV[]): number {
  const validos = criterios.filter((c) => c.nota !== null);
  const peso = validos.reduce((s, c) => s + c.peso, 0);
  if (!peso) return 0;
  return Math.round(validos.reduce((s, c) => s + (c.nota as number) * c.peso, 0) / peso);
}

/** Melhoria só mostra o trecho se ele existe de verdade no texto (a IA às vezes "cita" o que não está lá). */
export function trechoReal(texto: string, trecho: unknown): string | null {
  if (typeof trecho !== "string") return null;
  const t = trecho.trim().replace(/^["“”']|["“”']$/g, "");
  if (t.length < 8) return null;
  return normalizar(texto).includes(normalizar(t)) ? t : null;
}

export const ROTULO_NIVEL = { estagio: "Estágio", junior: "Júnior", pleno: "Pleno", senior: "Sênior" } as const;

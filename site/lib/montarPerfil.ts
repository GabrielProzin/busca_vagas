import { parseDocument, YAMLMap, type Document, type Scalar, type YAMLSeq } from "yaml";

// Perfil novo montado pelo assistente de instalação (a partir do currículo em PDF, revisado pela pessoa) e convertido
// para os dois arquivos que o coletor e o site leem: perfil/perfil.yaml e perfil/curriculo.md. Sem "server-only":
// funções puras, usadas também nos testes.

export type HabilidadeNova = { nome: string; peso: number; padroes: string[] };
export type DestaqueNovo = { texto: string; quando: string[]; frase: string };
export type PerfilNovo = {
  nome: string;
  nome_curto: string;
  cargo: string;
  titulo: string;
  cidade: string;
  experiencia_resumo: string;
  links: { linkedin?: string; github?: string; portfolio?: string };
  habilidades: HabilidadeNova[];
  destaques: DestaqueNovo[];
  curriculo_md: string;
};

const txt = (x: unknown, max = 200) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");
const url = (x: unknown) => {
  const v = typeof x === "string" ? x.trim() : "";
  if (!v) return undefined;
  const u = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return /^https?:\/\/[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(u) ? u : undefined;
};
/** "Power BI" → "power_bi" (chave de habilidade). */
export const chaveHabilidade = (x: string) =>
  x.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

/** Tira emails, telefones e CEP do texto: o repositório pode ser público. */
export function semContato(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "")
    .replace(/(\+?55[\s-]*)?\(?\b\d{2}\)?[\s-]*9?\d{4}[\s-]?\d{4}\b/g, "")
    .replace(/\b\d{5}-?\d{3}\b/g, "")
    .replace(/\b(tel(efone)?|cel(ular)?|whats(app)?|e-?mail|cep|endere[cç]o)\s*:?[ \t]*(?=[|·•,]|$)/gim, "")
    .replace(/[ \t]*[|·•][ \t]*(?=[|·•]|$)/gm, "")
    .replace(/[ \t]+$/gm, "");
}

/** Confere e limpa o que veio da IA ou do formulário de revisão: nada fora do formato chega ao repositório. */
export function normalizarPerfil(entrada: unknown): PerfilNovo {
  const r = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const links = (r.links && typeof r.links === "object" ? r.links : {}) as Record<string, unknown>;
  const vistas = new Set<string>();
  const habilidades = (Array.isArray(r.habilidades) ? r.habilidades : [])
    .map((h): HabilidadeNova => {
      const o = (h ?? {}) as Record<string, unknown>;
      const nome = chaveHabilidade(txt(o.nome, 60));
      const padroes = (Array.isArray(o.padroes) ? o.padroes : [])
        .map((p) => txt(p, 60).toLowerCase())
        .filter((p) => {
          if (!p) return false;
          try {
            new RegExp(p);
            return true;
          } catch {
            return false;
          }
        })
        .slice(0, 4);
      return { nome, peso: Math.max(1, Math.min(3, Math.round(Number(o.peso) || 1))), padroes: padroes.length ? padroes : nome ? [nome.replace(/_/g, " ")] : [] };
    })
    .filter((h) => h.nome && !vistas.has(h.nome) && vistas.add(h.nome))
    .slice(0, 40);
  const nomes = new Set(habilidades.map((h) => h.nome));
  const destaques = (Array.isArray(r.destaques) ? r.destaques : [])
    .map((d): DestaqueNovo => {
      const o = (d ?? {}) as Record<string, unknown>;
      return {
        texto: semContato(txt(o.texto, 300)),
        quando: (Array.isArray(o.quando) ? o.quando : []).map((q) => chaveHabilidade(txt(q, 60))).filter((q) => nomes.has(q)),
        frase: semContato(txt(o.frase, 300)),
      };
    })
    .filter((d) => d.texto && d.frase)
    .slice(0, 8);
  const nome = txt(r.nome, 80);
  return {
    nome,
    nome_curto: txt(r.nome_curto, 60) || nome.split(" ").filter(Boolean).slice(0, 2).join(" "),
    cargo: txt(r.cargo, 60),
    titulo: txt(r.titulo, 120),
    cidade: txt(r.cidade, 60),
    experiencia_resumo: txt(r.experiencia_resumo, 160),
    links: { linkedin: url(links.linkedin), github: url(links.github), portfolio: url(links.portfolio) },
    habilidades,
    destaques,
    curriculo_md: semContato(typeof r.curriculo_md === "string" ? r.curriculo_md.replace(/\r\n/g, "\n").trim().slice(0, 20000) : ""),
  };
}

/** O que falta para o perfil poder ser salvo (mensagens simples). */
export function problemasPerfil(p: PerfilNovo): string[] {
  const erros: string[] = [];
  if (p.nome.length < 3) erros.push("Falta o nome completo.");
  if (!p.cargo) erros.push("Falta o cargo.");
  if (p.habilidades.length < 3) erros.push("Deixe pelo menos 3 habilidades: são elas que dão a nota das vagas.");
  if (p.curriculo_md.length < 200) erros.push("O texto do currículo ficou curto demais. Confira se o PDF tem texto (não só imagem).");
  return erros;
}

/** Monta perfil/perfil.yaml em cima do arquivo atual (mantém comentários e as chaves que o assistente não mexe). */
export function perfilYaml(p: PerfilNovo, atual: string): string {
  let doc: Document;
  try {
    doc = parseDocument(atual);
    if (!(doc.contents instanceof YAMLMap)) doc = parseDocument("{}");
  } catch {
    doc = parseDocument("{}");
  }
  doc.set("nome", p.nome);
  doc.set("nome_curto", p.nome_curto);
  doc.set("cargo", p.cargo);
  doc.set("titulo", p.titulo || p.cargo);
  doc.set("cidade", p.cidade);
  doc.set("experiencia_resumo", p.experiencia_resumo || "o que venho fazendo na área");
  const links = Object.fromEntries(Object.entries(p.links).filter(([, v]) => v));
  doc.set("links", doc.createNode(links));
  const hab = doc.createNode(Object.fromEntries(p.habilidades.map((h) => [h.nome, { peso: h.peso, padroes: h.padroes }]))) as YAMLMap;
  for (const item of hab.items) {
    const h = item.value as YAMLMap;
    h.flow = true; // uma habilidade por linha, como no modelo
    // Regex sempre entre aspas simples: "power ?bi" sem aspas quebra o leitor de YAML do Python.
    for (const p of (h.get("padroes", true) as unknown as YAMLSeq<Scalar>).items) p.type = "QUOTE_SINGLE";
  }
  doc.set("habilidades", hab);
  doc.set("destaques", doc.createNode(p.destaques.map((d) => ({ texto: d.texto, quando: d.quando, frase: d.frase }))));
  for (const d of (doc.get("destaques") as { items: YAMLMap[] }).items) {
    const q = d.get("quando", true) as { flow?: boolean } | undefined;
    if (q) q.flow = true;
  }
  return doc.toString({ lineWidth: 0 });
}

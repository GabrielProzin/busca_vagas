// Cidades escritas de muitos jeitos nas vagas ("Goiânia - GO", "goiania/go", "GOIÂNIA (GO)", "Goiânia, Goiás", "Gyn")
// viram o mesmo nome-chave. Mesma regra de coletor/texto.py (separar_cidade): mude os dois juntos.
// Sem dependências: roda no servidor e no navegador.

export const UF_NOMES: Record<string, string> = {
  ac: "acre", al: "alagoas", ap: "amapa", am: "amazonas", ba: "bahia", ce: "ceara", df: "distrito federal",
  es: "espirito santo", go: "goias", ma: "maranhao", mt: "mato grosso", ms: "mato grosso do sul",
  mg: "minas gerais", pa: "para", pb: "paraiba", pr: "parana", pe: "pernambuco", pi: "piaui",
  rj: "rio de janeiro", rn: "rio grande do norte", rs: "rio grande do sul", ro: "rondonia", rr: "roraima",
  sc: "santa catarina", sp: "sao paulo", se: "sergipe", to: "tocantins",
};
const UF_DO_NOME: Record<string, string> = Object.fromEntries(Object.entries(UF_NOMES).map(([uf, n]) => [n, uf]));
export const APELIDOS_CIDADE: Record<string, string> = {
  bh: "belo horizonte", poa: "porto alegre", floripa: "florianopolis", sampa: "sao paulo",
  bsb: "brasilia", gyn: "goiania", sjc: "sao jose dos campos", rp: "ribeirao preto",
};

/** Minúsculo, sem acento, espaços colapsados (igual a normalizar() do coletor). */
export const normalizarTexto = (s: string | null | undefined) =>
  (s ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[ \t ]+/g, " ").trim();

const SEPARADOR = /\s+[-–—|]\s+|\s*[/,;()|]\s*/;
const UF_COLADA = new RegExp(`^(.*\\S)-(${Object.keys(UF_NOMES).join("|")})$`);
const limpar = (s: string) =>
  s.replace(/['’]/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().replace(/\bd (?=[aeiou])/g, "d");

/** "Goiânia - GO" → { nome: "goiania", uf: "go" }. */
export function separarCidade(s: string | null | undefined): { nome: string; uf: string | null } {
  const t = normalizarTexto(s);
  if (!t) return { nome: "", uf: null };
  const partes = t.split(SEPARADOR).map((p) => p?.trim()).filter(Boolean) as string[];
  if (!partes.length) return { nome: "", uf: null };
  let nome = partes[0];
  let uf: string | null = null;
  for (const p of partes.slice(1)) {
    const x = p.replace(/[^a-z0-9 ]+/g, "").trim();
    if (UF_NOMES[x]) { uf = x; break; }
    if (UF_DO_NOME[x]) { uf = UF_DO_NOME[x]; break; }
  }
  const m = nome.match(UF_COLADA);
  if (m && !uf) [nome, uf] = [m[1], m[2]];
  nome = limpar(nome);
  return { nome: APELIDOS_CIDADE[nome] ?? nome, uf };
}

/** "Goiânia - GO" (o formato salvo nas preferências). */
export const formatarCidade = (nome: string, uf: string) => `${nome} - ${uf.toUpperCase()}`;

/** A cidade da vaga é uma das aceitas? Sem estado na vaga, confia no nome. */
export function cidadeAceita(aceitas: string[], cidadeDaVaga: string | null | undefined): boolean {
  const v = separarCidade(cidadeDaVaga);
  if (!v.nome) return false;
  return aceitas.some((a) => {
    const c = separarCidade(a);
    return c.nome === v.nome && (!c.uf || !v.uf || c.uf === v.uf);
  });
}

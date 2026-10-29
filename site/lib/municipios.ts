import "server-only";
import MUNICIPIOS from "./dados/municipios.json";
import { formatarCidade, separarCidade } from "./cidades";

// Os 5.570 municípios do IBGE por estado (lib/dados/municipios.json, do pacote estados-cidades, licença MIT).
// O navegador carrega o mesmo arquivo sob demanda na tela Preferências.

const LISTA = MUNICIPIOS as Record<string, string[]>;
const POR_CHAVE = new Map<string, string[]>(); // "goiania" -> ["Goiânia - GO"]
for (const [uf, nomes] of Object.entries(LISTA)) {
  for (const n of nomes) {
    const k = separarCidade(n).nome;
    POR_CHAVE.set(k, [...(POR_CHAVE.get(k) ?? []), formatarCidade(n, uf)]);
  }
}

/** Valor da tela ("Goiânia - GO") → o nome oficial no mesmo formato, ou null se não existe. */
export function municipioOficial(valor: string): string | null {
  const { nome, uf } = separarCidade(valor);
  if (!nome || !uf) return null;
  return (POR_CHAVE.get(nome) ?? []).find((c) => c.endsWith(` - ${uf.toUpperCase()}`)) ?? null;
}

/** Cidade salva sem estado ("Goiânia", do YAML antigo) → "Goiânia - GO". Prefere o estado dado; se o nome só
 *  existe num estado, usa esse. Sem jeito de saber, devolve como veio. */
export function resolverCidade(valor: string, ufPreferida?: string | null): string {
  const oficial = municipioOficial(valor);
  if (oficial) return oficial;
  const { nome } = separarCidade(valor);
  const achadas = POR_CHAVE.get(nome) ?? [];
  const uf = (ufPreferida ?? "").toUpperCase();
  return achadas.find((c) => uf && c.endsWith(` - ${uf}`)) ?? (achadas.length === 1 ? achadas[0] : valor);
}

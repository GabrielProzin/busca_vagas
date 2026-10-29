"use client";

import { startTransition, useActionState, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { salvarPreferenciasBusca, type EstadoPreferencias } from "@/app/acoes";
import { LIMITES, NIVEIS, SUGESTOES_CARGOS, type Nivel, type Preferencias } from "@/lib/preferencias";
import { normalizarTexto } from "@/lib/cidades";
import Icone, { type NomeIcone } from "./Icone";

// Tela Preferências: o que entra na lista de vagas. Tudo é validado de novo no servidor (lib/preferencias.ts).
// O estado da ação fica aqui fora; o painel de dentro recomeça (key) quando as preferências salvas mudam,
// para mostrar os valores novos sem perder a mensagem de "salvo".
export default function PainelPreferencias({ prefs, salvasEm }: { prefs: Preferencias; salvasEm: string | null }) {
  const [estado, acao, salvando] = useActionState<EstadoPreferencias, FormData>(salvarPreferenciasBusca, null);
  return <FormPreferencias key={salvasEm ?? "padrao"} inicial={prefs} salvas={Boolean(salvasEm)} estado={estado} acao={acao} salvando={salvando} />;
}

const MODOS: { id: keyof Preferencias["modalidades"]; rotulo: string; dica: string; icone: NomeIcone }[] = [
  { id: "remoto", rotulo: "Remoto", dica: "De qualquer lugar do Brasil", icone: "globo" },
  { id: "hibrido", rotulo: "Híbrido", dica: "Parte da semana no escritório", icone: "alternar" },
  { id: "presencial", rotulo: "Presencial", dica: "Todos os dias no escritório", icone: "empresa" },
];

type PropsForm = {
  inicial: Preferencias;
  salvas: boolean;
  estado: EstadoPreferencias;
  acao: (dados: FormData) => void;
  salvando: boolean;
};

const semEstado = (c: string) => c.replace(/ - [A-Z]{2}$/, "");

/** "remoto, ou híbrido e presencial em Goiânia e mais 3 cidades · júnior · até 2 anos · CLT ou PJ" */
function resumo(p: Preferencias): string {
  const modos = MODOS.filter((m) => p.modalidades[m.id]).map((m) => m.rotulo.toLowerCase());
  const local = p.modalidades.hibrido || p.modalidades.presencial;
  const cidades = p.cidades.length ? `${semEstado(p.cidades[0])}${p.cidades.length > 1 ? ` e mais ${p.cidades.length - 1}` : ""}` : "nenhuma cidade";
  const ondeLocal = modos.filter((m) => m !== "remoto");
  const onde = [
    p.modalidades.remoto ? "remoto" : "",
    local ? `${ondeLocal.join(" e ")} em ${cidades}` : "",
  ].filter(Boolean).join(", ou ");
  const niveis = NIVEIS.filter((n) => p.niveis.includes(n.id)).map((n) => n.rotulo.toLowerCase()).join(", ");
  const contrato = p.contratos.clt && p.contratos.pj ? "CLT ou PJ" : p.contratos.clt ? "só CLT" : "só PJ";
  return [onde || "nenhuma forma de trabalho", niveis || "nenhum nível", `até ${p.max_anos} ${p.max_anos === 1 ? "ano" : "anos"} de experiência`, contrato].join(" · ");
}

function FormPreferencias({ inicial, salvas, estado, acao, salvando }: PropsForm) {
  const [p, setP] = useState<Preferencias>(inicial);
  const mudar = <K extends keyof Preferencias>(k: K, v: Preferencias[K]) => setP((x) => ({ ...x, [k]: v }));
  const alterado = JSON.stringify(p) !== JSON.stringify(inicial);
  const precisaCidade = p.modalidades.hibrido || p.modalidades.presencial;

  function enviar(acaoBotao: "salvar" | "padrao") {
    const d = new FormData();
    d.set("acao", acaoBotao);
    for (const m of MODOS) if (p.modalidades[m.id]) d.set(m.id, "on");
    for (const c of p.cidades) d.append("cidade", c);
    for (const n of p.niveis) d.set(`nivel_${n}`, "on");
    d.set("max_anos", String(p.max_anos));
    if (p.contratos.clt) d.set("clt", "on");
    if (p.contratos.pj) d.set("pj", "on");
    for (const t of p.termos_busca) d.append("termo", t);
    for (const t of p.palavras_bloqueadas) d.append("palavra", t);
    for (const t of p.empresas_bloqueadas) d.append("empresa", t);
    if (p.aceita_ingles) d.set("aceita_ingles", "on");
    startTransition(() => acao(d));
  }

  return (
    <form
      className="pf"
      onSubmit={(e) => {
        e.preventDefault();
        enviar("salvar");
      }}
    >
      <section className="pf-resumo" aria-live="polite">
        <span className="pf-resumo-icone" aria-hidden><Icone nome="filtro" tamanho={18} /></span>
        <div>
          <span className="pf-resumo-rotulo">{salvas ? "Sua busca" : "Sua busca (padrão inicial)"}</span>
          <p>{resumo(p)}</p>
        </div>
      </section>

      <Secao icone="local" titulo="Onde você quer trabalhar" descricao="Marque todas as formas que servem para você.">
        <div className="pf-modos" role="group" aria-label="Formas de trabalho">
          {MODOS.map((m) => (
            <label key={m.id} className="pf-modo">
              <input
                type="checkbox"
                checked={p.modalidades[m.id]}
                onChange={(e) => mudar("modalidades", { ...p.modalidades, [m.id]: e.target.checked })}
              />
              <span className="pf-modo-icone" aria-hidden><Icone nome={m.icone} tamanho={20} /></span>
              <span className="pf-modo-texto"><b>{m.rotulo}</b><small>{m.dica}</small></span>
              <span className="pf-marca" aria-hidden><Icone nome="check" tamanho={14} /></span>
            </label>
          ))}
        </div>

        {precisaCidade ? (
          <div className="pf-campo">
            <div className="pf-campo-topo">
              <span id="rotulo-cidades" className="pf-rotulo">Cidades para híbrido e presencial</span>
              <span className="pf-contador">{p.cidades.length} de {LIMITES.cidades}</span>
            </div>
            <SeletorCidades valor={p.cidades} onMudar={(c) => mudar("cidades", c)} rotulo="rotulo-cidades" />
            <small className="dica">
              As vagas escrevem a cidade de muitos jeitos (“Goiania”, “GOIÂNIA - GO”, “Gyn”): o sistema entende todos.
              Vagas que citam outro estado ficam de fora.
            </small>
          </div>
        ) : (
          <p className="pf-nota"><Icone nome="globo" tamanho={15} /> Só remoto: vale para vagas de todo o Brasil, sem escolher cidade.</p>
        )}
      </Secao>

      <Secao icone="busca" titulo="Cargos que você procura" descricao="Cada cargo vira uma busca nas plataformas de vagas.">
        <CampoEtiquetas
          nome="cargos"
          valor={p.termos_busca}
          onMudar={(v) => mudar("termos_busca", v)}
          limite={LIMITES.termos}
          placeholder="Digite um cargo e aperte Enter"
          sugestoes={SUGESTOES_CARGOS}
          rotulo="Cargos"
        />
      </Secao>

      <Secao icone="ranking" titulo="Nível e experiência" descricao="Cargos de liderança (coordenador, gerente, head…) ficam sempre de fora.">
        <div className="pf-campo">
          <span className="pf-rotulo" id="rotulo-niveis">Níveis aceitos</span>
          <div className="pf-segmentos" role="group" aria-labelledby="rotulo-niveis">
            {NIVEIS.map((n) => {
              const ligado = p.niveis.includes(n.id);
              return (
                <label key={n.id} className="pf-segmento">
                  <input
                    type="checkbox"
                    checked={ligado}
                    onChange={() => mudar("niveis", ligado ? p.niveis.filter((x) => x !== n.id) : ([...p.niveis, n.id] as Nivel[]))}
                  />
                  <span>{n.rotulo}</span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="pf-campo">
          <span className="pf-rotulo" id="rotulo-anos">Experiência máxima pedida na vaga</span>
          <div className="pf-passo" role="group" aria-labelledby="rotulo-anos">
            <button type="button" className="pf-passo-botao" onClick={() => mudar("max_anos", Math.max(0, p.max_anos - 1))} aria-label="Menos um ano" disabled={p.max_anos <= 0}>−</button>
            <output aria-live="polite"><b>{p.max_anos}</b> {p.max_anos === 1 ? "ano" : "anos"}</output>
            <button type="button" className="pf-passo-botao" onClick={() => mudar("max_anos", Math.min(15, p.max_anos + 1))} aria-label="Mais um ano" disabled={p.max_anos >= 15}>+</button>
          </div>
          <small className="dica">Vagas que pedem mais que isso saem da lista.</small>
        </div>
      </Secao>

      <Secao icone="contrato" titulo="Tipo de contrato" descricao="Vagas que não dizem o contrato sempre entram.">
        <div className="pf-modos pf-duas" role="group" aria-label="Tipos de contrato">
          {([
            { id: "clt", rotulo: "CLT", dica: "Carteira assinada" },
            { id: "pj", rotulo: "PJ", dica: "Pessoa jurídica, com nota fiscal" },
          ] as const).map((c) => (
            <label key={c.id} className="pf-modo">
              <input type="checkbox" checked={p.contratos[c.id]} onChange={(e) => mudar("contratos", { ...p.contratos, [c.id]: e.target.checked })} />
              <span className="pf-modo-texto"><b>{c.rotulo}</b><small>{c.dica}</small></span>
              <span className="pf-marca" aria-hidden><Icone nome="check" tamanho={14} /></span>
            </label>
          ))}
        </div>
      </Secao>

      <Secao icone="bloquear" titulo="O que evitar" descricao="Somam às regras que já vêm no sistema (desenvolvedor, suporte…).">
        <div className="pf-campo">
          <span className="pf-rotulo">Palavras no título da vaga</span>
          <CampoEtiquetas nome="palavras" valor={p.palavras_bloqueadas} onMudar={(v) => mudar("palavras_bloqueadas", v)} limite={LIMITES.palavras} placeholder="Ex.: marketing, vendas" rotulo="Palavras no título" />
        </div>
        <div className="pf-campo">
          <span className="pf-rotulo">Empresas</span>
          <CampoEtiquetas nome="empresas" valor={p.empresas_bloqueadas} onMudar={(v) => mudar("empresas_bloqueadas", v)} limite={LIMITES.empresas} placeholder="Nome ou domínio (empresa.com.br)" rotulo="Empresas" />
        </div>
      </Secao>

      <Secao icone="idioma" titulo="Idioma" descricao="Vagas em inglês quase sempre pedem inglês fluente.">
        <label className="pf-chave">
          <input type="checkbox" role="switch" checked={p.aceita_ingles} onChange={(e) => mudar("aceita_ingles", e.target.checked)} />
          <span className="pf-chave-trilho" aria-hidden><i /></span>
          <span>Incluir vagas com a descrição em inglês</span>
        </label>
      </Secao>

      <div className={`pf-barra${alterado ? " alterado" : ""}`}>
        <div className="pf-barra-texto" role="status">
          {estado?.erro && !salvando ? (
            <span className="erro" role="alert"><Icone nome="alerta" tamanho={15} /> {estado.erro}</span>
          ) : alterado ? (
            <span><b>Alterações não salvas.</b> Valem a partir da próxima coleta.</span>
          ) : estado?.ok ? (
            <span className="pf-ok"><Icone nome="check" tamanho={15} /> {estado.ok}</span>
          ) : (
            <span className="dica">{salvas ? "Tudo salvo. Valem a partir da próxima coleta." : "Ainda no padrão inicial."}</span>
          )}
        </div>
        <div className="linha-botoes">
          {alterado ? (
            <button type="button" className="botao fantasma" onClick={() => setP(inicial)} disabled={salvando}>Descartar</button>
          ) : salvas ? (
            <button type="button" className="botao fantasma" onClick={() => enviar("padrao")} disabled={salvando}>Voltar ao padrão</button>
          ) : null}
          <button type="submit" className="botao primario" disabled={salvando || !alterado}>
            <Icone nome="check" tamanho={16} /> {salvando ? "Salvando…" : "Salvar preferências"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Secao({ icone, titulo, descricao, children }: { icone: NomeIcone; titulo: string; descricao: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="cartao pf-secao" aria-labelledby={id}>
      <header className="pf-secao-topo">
        <span className="pf-secao-icone" aria-hidden><Icone nome={icone} tamanho={18} /></span>
        <div>
          <h2 id={id}>{titulo}</h2>
          <p className="dica">{descricao}</p>
        </div>
      </header>
      <div className="pf-secao-corpo">{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------ etiquetas (cargos, palavras, empresas)
function CampoEtiquetas({ nome, valor, onMudar, limite, placeholder, sugestoes = [], rotulo }: {
  nome: string; valor: string[]; onMudar: (v: string[]) => void; limite: number; placeholder: string; sugestoes?: readonly string[]; rotulo: string;
}) {
  const [texto, setTexto] = useState("");
  const cheio = valor.length >= limite;
  const tem = (x: string) => valor.some((v) => v.toLowerCase() === x.toLowerCase());
  function adicionar(bruto: string) {
    const novos = bruto.split(/[,;\n]/).map((x) => x.trim().replace(/\s+/g, " ").slice(0, LIMITES.texto)).filter((x) => x && !tem(x));
    if (novos.length) onMudar([...valor, ...novos].slice(0, limite));
    setTexto("");
  }
  function tecla(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && texto.trim()) {
      e.preventDefault();
      adicionar(texto);
    } else if (e.key === "Enter") {
      e.preventDefault(); // Enter vazio não envia o formulário
    } else if (e.key === "Backspace" && !texto && valor.length) {
      onMudar(valor.slice(0, -1));
    }
  }
  const livres = sugestoes.filter((s) => !tem(s));
  return (
    <div className="pf-etiquetas-campo">
      <div className="pf-caixa" onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
        {valor.map((v) => (
          <span key={v} className="pf-etiqueta">
            {v}
            <button type="button" onClick={() => onMudar(valor.filter((x) => x !== v))} aria-label={`Tirar ${v}`}><Icone nome="x" tamanho={12} /></button>
          </span>
        ))}
        <input
          type="text"
          value={texto}
          onChange={(e) => (e.target.value.includes(",") ? adicionar(e.target.value) : setTexto(e.target.value))}
          onKeyDown={tecla}
          onBlur={() => texto.trim() && adicionar(texto)}
          placeholder={cheio ? `Limite de ${limite}` : valor.length ? "Adicionar…" : placeholder}
          disabled={cheio}
          aria-label={rotulo}
          name={`${nome}_digitando`}
          autoComplete="off"
          enterKeyHint="done"
        />
      </div>
      {livres.length && !cheio ? (
        <div className="pf-sugestoes" aria-label={`Sugestões de ${rotulo.toLowerCase()}`}>
          <span className="dica">Sugestões:</span>
          {livres.slice(0, 8).map((s) => (
            <button key={s} type="button" className="pf-sugestao" onClick={() => adicionar(s)}>+ {s}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ cidades (lista do IBGE com busca)
type Municipio = { rotulo: string; nome: string; uf: string; chave: string };
let CACHE: Municipio[] | null = null;
const chaveBusca = (s: string) => normalizarTexto(s).replace(/['’]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
// Maiores cidades (IBGE): aparecem primeiro na busca ("sao" → São Paulo antes de São Brás).
const GRANDES = [
  "São Paulo - SP", "Rio de Janeiro - RJ", "Brasília - DF", "Fortaleza - CE", "Salvador - BA", "Belo Horizonte - MG", "Manaus - AM",
  "Curitiba - PR", "Recife - PE", "Goiânia - GO", "Porto Alegre - RS", "Belém - PA", "Guarulhos - SP", "Campinas - SP", "São Luís - MA",
  "Maceió - AL", "Campo Grande - MS", "São Gonçalo - RJ", "Teresina - PI", "João Pessoa - PB", "São Bernardo do Campo - SP",
  "Duque de Caxias - RJ", "Nova Iguaçu - RJ", "Natal - RN", "Santo André - SP", "Osasco - SP", "Sorocaba - SP", "Uberlândia - MG",
  "Ribeirão Preto - SP", "São José dos Campos - SP", "Cuiabá - MT", "Jaboatão dos Guararapes - PE", "Contagem - MG", "Joinville - SC",
  "Feira de Santana - BA", "Aracaju - SE", "Londrina - PR", "Juiz de Fora - MG", "Florianópolis - SC", "Aparecida de Goiânia - GO",
  "Serra - ES", "Campos dos Goytacazes - RJ", "Belford Roxo - RJ", "Niterói - RJ", "São José do Rio Preto - SP", "Ananindeua - PA",
  "Vila Velha - ES", "Caxias do Sul - RS", "Porto Velho - RO", "Mogi das Cruzes - SP", "Jundiaí - SP", "Macapá - AP",
  "São João de Meriti - RJ", "Piracicaba - SP", "Campina Grande - PB", "Santos - SP", "Mauá - SP", "Montes Claros - MG",
  "Boa Vista - RR", "Betim - MG", "Maringá - PR", "Anápolis - GO", "Diadema - SP", "Carapicuíba - SP", "Petrolina - PE", "Bauru - SP",
  "Caruaru - PE", "Vitória da Conquista - BA", "Itaquaquecetuba - SP", "Rio Branco - AC", "Blumenau - SC", "Ponta Grossa - PR",
  "Cariacica - ES", "Caucaia - CE", "Franca - SP", "Olinda - PE", "Praia Grande - SP", "Cascavel - PR", "Canoas - RS", "Paulista - PE",
  "Uberaba - MG", "Santarém - PA", "São Vicente - SP", "Ribeirão das Neves - MG", "Petrópolis - RJ", "Vitória - ES", "Palmas - TO",
  "Barueri - SP", "Senador Canedo - GO", "São José - SC", "Taubaté - SP", "Limeira - SP", "Suzano - SP", "Guarujá - SP",
];
const PESO_GRANDE = new Map(GRANDES.map((c, i) => [c, i]));
const CAPITAIS = GRANDES.slice(0, 12);

async function carregarMunicipios(): Promise<Municipio[]> {
  if (CACHE) return CACHE;
  const dados = (await import("@/lib/dados/municipios.json")).default as Record<string, string[]>;
  CACHE = Object.entries(dados).flatMap(([uf, nomes]) => nomes.map((nome) => ({ rotulo: `${nome} - ${uf}`, nome, uf, chave: `${chaveBusca(nome)} ${uf.toLowerCase()}` })));
  return CACHE;
}

function SeletorCidades({ valor, onMudar, rotulo }: { valor: string[]; onMudar: (v: string[]) => void; rotulo: string }) {
  const [todas, setTodas] = useState<Municipio[] | null>(CACHE);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const idLista = useId();
  const cheio = valor.length >= LIMITES.cidades;

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function abrir() {
    setAberto(true);
    if (!todas) carregarMunicipios().then(setTodas);
  }

  const resultados = useMemo(() => {
    if (!todas) return [];
    const q = chaveBusca(busca);
    if (!q) {
      // Sem busca: outras cidades dos estados já escolhidos (vizinhas), ou as maiores capitais.
      const ufs = new Set(valor.map((c) => c.slice(-2)));
      const grandesPrimeiro = (l: Municipio[]) => [...l].sort((a, b) => (PESO_GRANDE.get(a.rotulo) ?? 999) - (PESO_GRANDE.get(b.rotulo) ?? 999));
      const base = ufs.size ? grandesPrimeiro(todas.filter((m) => ufs.has(m.uf))) : CAPITAIS.map((c) => todas.find((m) => m.rotulo === c)).filter(Boolean) as Municipio[];
      return base.slice(0, 60);
    }
    // Ordem: nome exato, começo do nome, começo de uma palavra, qualquer parte. Dentro de cada grupo, as cidades
    // grandes e as dos estados já escolhidos vêm antes.
    const ufs = new Set(valor.map((c) => c.slice(-2)));
    const achados: { m: Municipio; n: number }[] = [];
    for (const m of todas) {
      const nome = m.chave.slice(0, -3);
      const grupo = nome === q || m.chave === q ? 0 : m.chave.startsWith(q) ? 1 : m.chave.includes(` ${q}`) ? 2 : m.chave.includes(q) ? 3 : -1;
      if (grupo < 0) continue;
      const g = PESO_GRANDE.get(m.rotulo);
      achados.push({ m, n: grupo * 1000 + (g !== undefined ? g : ufs.has(m.uf) ? 200 : 500) });
    }
    return achados.sort((a, b) => a.n - b.n).slice(0, 60).map((a) => a.m);
  }, [todas, busca, valor]);

  function alternar(m: Municipio) {
    if (valor.includes(m.rotulo)) onMudar(valor.filter((c) => c !== m.rotulo));
    else if (!cheio) onMudar([...valor, m.rotulo]);
    entrada.current?.focus();
  }

  function tecla(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); abrir(); setFoco((f) => Math.min(f + 1, resultados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (aberto && resultados[foco]) alternar(resultados[foco]); }
    else if (e.key === "Escape") { setAberto(false); }
    else if (e.key === "Backspace" && !busca && valor.length) { onMudar(valor.slice(0, -1)); }
  }

  useEffect(() => setFoco(0), [busca]);
  useEffect(() => {
    document.getElementById(`${idLista}-${foco}`)?.scrollIntoView({ block: "nearest" });
  }, [foco, idLista]);

  return (
    <div className="pf-cidades" ref={raiz}>
      <div className={`pf-caixa${aberto ? " aberta" : ""}`} onClick={() => { entrada.current?.focus(); abrir(); }}>
        <Icone nome="busca" tamanho={16} className="pf-caixa-icone" />
        {valor.map((c) => (
          <span key={c} className="pf-etiqueta">
            {semEstado(c)} <small>{c.slice(-2)}</small>
            <button type="button" onClick={(e) => { e.stopPropagation(); onMudar(valor.filter((x) => x !== c)); }} aria-label={`Tirar ${c}`}>
              <Icone nome="x" tamanho={12} />
            </button>
          </span>
        ))}
        <input
          ref={entrada}
          type="text"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={idLista}
          aria-labelledby={rotulo}
          aria-autocomplete="list"
          aria-activedescendant={aberto && resultados[foco] ? `${idLista}-${foco}` : undefined}
          value={busca}
          onChange={(e) => { setBusca(e.target.value); abrir(); }}
          onFocus={abrir}
          onKeyDown={tecla}
          placeholder={cheio ? `Limite de ${LIMITES.cidades} cidades` : valor.length ? "Buscar mais cidades…" : "Busque a cidade (ex.: Goiânia)"}
          autoComplete="off"
          name="cidade_busca"
        />
      </div>
      {aberto ? (
        <div className="pf-menu">
          {!todas ? (
            <p className="pf-menu-vazio">Carregando as cidades…</p>
          ) : resultados.length ? (
            <>
              <p className="pf-menu-titulo">
                {busca ? `${resultados.length >= 60 ? "Primeiros resultados" : "Resultados"} para “${busca}”` : valor.length ? "Cidades dos estados escolhidos" : "Cidades mais buscadas"}
              </p>
              <ul id={idLista} role="listbox" aria-multiselectable="true" aria-labelledby={rotulo}>
                {resultados.map((m, i) => {
                  const marcada = valor.includes(m.rotulo);
                  return (
                    <li
                      key={m.rotulo}
                      id={`${idLista}-${i}`}
                      role="option"
                      aria-selected={marcada}
                      className={`${i === foco ? "foco" : ""}${!marcada && cheio ? " desligada" : ""}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setFoco(i)}
                      onClick={() => alternar(m)}
                    >
                      <span className="pf-caixinha" aria-hidden>{marcada ? <Icone nome="check" tamanho={12} /> : null}</span>
                      <span>{m.nome}</span>
                      <small>{m.uf}</small>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="pf-menu-vazio">Nenhuma cidade com “{busca}”. Confira a escrita (acentos não importam).</p>
          )}
          <div className="pf-menu-rodape">
            <span>{valor.length} de {LIMITES.cidades} escolhidas</span>
            <button type="button" className="botao pequeno" onClick={() => setAberto(false)}>Pronto</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

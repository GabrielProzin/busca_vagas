"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import Icone from "./Icone";
import { useAviso } from "./Avisos";
import { moverCandidatura } from "@/app/acoes";

export type ItemTriagem = {
  id: string;
  titulo: string;
  empresa: string;
  local: string;
  fonte: string;
  naFonte: string;
  quando: string;
  nota: number;
  valeTentar: boolean;
  email: string | null;
  url: string | null;
  href: string;
  frase: string | null;
  motivos: string[];
  ok: string[];
  falta: string[];
  trecho: string;
};

type Decisao = "descartada" | "aplicada";

// Atalhos: D descartar · A já apliquei · Enter abrir · → pular · ← voltar · Z desfazer.
export default function Triagem({ itens }: { itens: ItemTriagem[] }) {
  const router = useRouter();
  const aviso = useAviso();
  const [, startTransition] = useTransition();
  const [i, setI] = useState(0);
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({});
  const [historico, setHistorico] = useState<{ id: string; indice: number }[]>([]);
  const [verTudo, setVerTudo] = useState(false);

  const total = itens.length;
  const decididas = Object.keys(decisoes).length;
  const atual = i < total ? itens[i] : null;

  const proximaPendente = useCallback(
    (desde: number, d: Record<string, Decisao>) => {
      for (let k = desde; k < total; k++) if (!d[itens[k].id]) return k;
      return total;
    },
    [itens, total],
  );

  const decidir = useCallback(
    (status: Decisao) => {
      if (!atual || decisoes[atual.id]) return;
      const item = atual;
      const novas = { ...decisoes, [item.id]: status };
      setDecisoes(novas);
      setHistorico((h) => [...h, { id: item.id, indice: i }]);
      setI(proximaPendente(i + 1, novas));
      setVerTudo(false);
      startTransition(async () => {
        const erro = await moverCandidatura(item.id, status);
        if (erro) {
          setDecisoes((d) => {
            const { [item.id]: _, ...resto } = d;
            return resto;
          });
          aviso({ texto: erro, tipo: "erro" });
        }
      });
    },
    [atual, decisoes, i, proximaPendente, aviso],
  );

  const desfazer = useCallback(() => {
    const ultimo = historico.at(-1);
    if (!ultimo) return;
    setHistorico((h) => h.slice(0, -1));
    setDecisoes((d) => {
      const { [ultimo.id]: _, ...resto } = d;
      return resto;
    });
    setI(ultimo.indice);
    startTransition(async () => {
      const erro = await moverCandidatura(ultimo.id, "nova");
      if (erro) aviso({ texto: erro, tipo: "erro" });
    });
  }, [historico, aviso]);

  const pular = useCallback(() => setI((k) => Math.min(total, k + 1)), [total]);
  const voltar = useCallback(() => setI((k) => Math.max(0, k - 1)), []);
  const abrir = useCallback(() => {
    if (atual) router.push(atual.href);
  }, [atual, router]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || alvo?.closest("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      const mapa: Record<string, () => void> = {
        d: () => decidir("descartada"),
        a: () => decidir("aplicada"),
        enter: abrir,
        o: abrir,
        arrowright: pular,
        j: pular,
        arrowleft: voltar,
        k: voltar,
        z: desfazer,
        u: desfazer,
      };
      const f = mapa[k];
      if (f && !(k === "enter" && alvo?.closest("a, button"))) {
        e.preventDefault();
        f();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [decidir, abrir, pular, voltar, desfazer]);

  if (total === 0) {
    return (
      <div className="cartao vazio">
        <Icone nome="triagem" tamanho={36} />
        <b>Nenhuma vaga nova para triar</b>
        <p>Quando a próxima coleta trouxer vagas, elas aparecem aqui.</p>
        <Link className="botao" href="/">Voltar para Hoje</Link>
      </div>
    );
  }

  const descartadas = Object.values(decisoes).filter((d) => d === "descartada").length;
  const aplicadas = decididas - descartadas;
  const pendentes = total - decididas;

  if (!atual) {
    return (
      <div className="cartao vazio">
        <Icone nome="check" tamanho={36} />
        <b>{pendentes ? "Chegou ao fim da lista" : "Triagem concluída"}</b>
        <p>
          {descartadas} {descartadas === 1 ? "descartada" : "descartadas"}, {aplicadas} {aplicadas === 1 ? "aplicada" : "aplicadas"}
          {pendentes ? `, ${pendentes} ${pendentes === 1 ? "pulada" : "puladas"}` : ""}.
        </p>
        <div className="linha-botoes" style={{ justifyContent: "center" }}>
          {pendentes ? (
            <button className="botao primario" type="button" onClick={() => setI(proximaPendente(0, decisoes))}>
              Revisar as puladas
            </button>
          ) : null}
          {historico.length ? <button className="botao" type="button" onClick={desfazer}>Desfazer a última (Z)</button> : null}
          <Link className="botao" href="/vagas?email=1">Vagas com email</Link>
          <Link className="botao" href="/">Voltar para Hoje</Link>
        </div>
      </div>
    );
  }

  const decidida = decisoes[atual.id];
  return (
    <div className="triagem">
      <div className="triagem-progresso" aria-label={`${decididas} de ${total} decididas`}>
        <span>Vaga {i + 1} de {total}</span>
        <div className="trilho"><i style={{ width: `${Math.round((decididas / total) * 100)}%` }} /></div>
        <span>{decididas} decididas</span>
      </div>

      <article className="cartao triagem-cartao" aria-live="polite">
        <div className="triagem-topo">
          <div className={`triagem-nota${atual.valeTentar ? " vale" : ""}`}>
            <strong>{atual.nota}</strong>
            <span>{atual.valeTentar ? "vale tentar" : "nota"}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 className="triagem-titulo">{atual.titulo}</h2>
            <p className="tv-meta">
              <span className="item"><Icone nome="empresa" tamanho={14} />{atual.empresa}</span>
              <span className="item"><Icone nome="local" tamanho={14} />{atual.local}</span>
              <span className="item"><Icone nome="fonte" tamanho={14} />{atual.fonte}, {atual.quando}</span>
            </p>
            {atual.email ? (
              <span className="etiqueta email" style={{ marginTop: 8 }}><Icone nome="email" tamanho={12} /> Tem email do recrutador</span>
            ) : null}
          </div>
        </div>

        {atual.frase ? <p className="triagem-frase">{atual.frase}</p> : null}
        {atual.motivos.length ? <ul className="motivos">{atual.motivos.map((m) => <li key={m}>{m}</li>)}</ul> : null}
        {atual.ok.length || atual.falta.length ? (
          <div className="etiquetas">
            {atual.ok.map((h) => <span key={h} className="etiqueta ok">{h}</span>)}
            {atual.falta.map((h) => <span key={h} className="etiqueta falta">Falta {h}</span>)}
          </div>
        ) : null}
        {atual.trecho ? (
          <div className={`triagem-trecho${verTudo ? " aberto" : ""}`}>
            <div className="descricao">{atual.trecho}</div>
            {atual.trecho.length > 300 ? (
              <button type="button" className="link-botao" onClick={() => setVerTudo((x) => !x)}>
                {verTudo ? "Mostrar menos" : "Mostrar mais"}
              </button>
            ) : null}
          </div>
        ) : null}
        {decidida ? (
          <p className="aviso ok">Você já marcou esta como {decidida === "descartada" ? "descartada" : "aplicada"}.</p>
        ) : null}
      </article>

      <div className="triagem-acoes" role="toolbar" aria-label="Decidir esta vaga">
        <button type="button" className="botao perigo grande" onClick={() => decidir("descartada")} disabled={Boolean(decidida)}>
          <Icone nome="x" /> Descartar <kbd>D</kbd>
        </button>
        <button type="button" className="botao grande" onClick={pular}>
          Pular <kbd>→</kbd>
        </button>
        <button type="button" className="botao grande" onClick={() => decidir("aplicada")} disabled={Boolean(decidida)} title="Use depois de se candidatar pelo link">
          <Icone nome="check" /> Já apliquei <kbd>A</kbd>
        </button>
        <button type="button" className="botao primario grande" onClick={abrir}>
          {atual.email ? <><Icone nome="email" /> Escrever email</> : <><Icone nome="externo" /> Abrir vaga</>} <kbd>↵</kbd>
        </button>
      </div>
      <div className="triagem-rodape">
        <button type="button" className="link-botao" onClick={voltar} disabled={i === 0}>← Anterior</button>
        <button type="button" className="link-botao" onClick={desfazer} disabled={!historico.length}>Desfazer a última <kbd>Z</kbd></button>
        {atual.url ? (
          <a className="link-botao" href={atual.url} target="_blank" rel="noopener noreferrer">Ver {atual.naFonte} <Icone nome="externo" tamanho={13} /></a>
        ) : null}
      </div>
    </div>
  );
}

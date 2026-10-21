"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import Icone from "./Icone";
import Seletor from "./Seletor";
import { moverCandidatura } from "@/app/acoes";
import type { Status } from "@/lib/tipos";
import { FOLLOWUP_DIAS } from "@/lib/followup";

export type CartaoKanban = {
  id: string;
  titulo: string;
  empresa: string;
  quando: string;
  status: Status;
  nota: number | null;
  porEmail: boolean;
  href: string;
  // "followup": passou de FOLLOWUP_DIAS dias sem resposta; "encerrar": já teve 2 follow-ups e segue sem resposta.
  followup: "followup" | "encerrar" | null;
  diasSemResposta: number | null;
};

type Etapa = { status: Status; rotulo: string; cor: string };

// Kanban: arraste o cartão para outra coluna (mouse) ou use o menu ⋯ (teclado e celular).
// A mudança aparece na hora e é salva em seguida; se o banco recusar, o cartão volta.
export default function QuadroCandidaturas({ iniciais, etapas }: { iniciais: CartaoKanban[]; etapas: Etapa[] }) {
  const [cartoes, setCartoes] = useState(iniciais);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<Status | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function mover(id: string, status: Status) {
    const antes = cartoes;
    const cartao = antes.find((c) => c.id === id);
    if (!cartao || cartao.status === status) return;
    setErro(null);
    setCartoes((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
    startTransition(async () => {
      const falha = await moverCandidatura(id, status);
      if (falha) {
        setCartoes(antes);
        setErro(falha);
      }
    });
  }

  const opcoes = etapas.map((e) => ({ valor: e.status, rotulo: e.rotulo }));

  return (
    <>
      {erro ? <p className="aviso" role="alert" style={{ marginBottom: 12 }}>{erro}</p> : null}
      <div className="kanban" aria-label="Quadro de candidaturas">
        {etapas.map((etapa) => {
          const daEtapa = cartoes.filter((c) => c.status === etapa.status);
          const realce = alvo === etapa.status && arrastando !== null && cartoes.find((c) => c.id === arrastando)?.status !== etapa.status;
          return (
            <section
              key={etapa.status}
              className={`kanban-coluna${realce ? " alvo" : ""}${daEtapa.length ? "" : " vazia"}`}
              aria-label={etapa.rotulo}
              onDragOver={(e) => { if (arrastando) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setAlvo(etapa.status); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo((a) => (a === etapa.status ? null : a)); }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || arrastando;
                if (id) mover(id, etapa.status);
                setAlvo(null);
                setArrastando(null);
              }}
            >
              <header className="kanban-cabecalho">
                <span className="ponto-etapa" style={{ background: etapa.cor }} aria-hidden />
                <h2>{etapa.rotulo}</h2>
                <span className="contador">{daEtapa.length}</span>
              </header>
              <div className="kanban-cartoes">
                {daEtapa.map((c) => (
                  <article
                    key={c.id}
                    className={`kanban-cartao${arrastando === c.id ? " arrastando" : ""}${c.followup === "followup" && (c.status === "aplicada" || c.status === "enviada") ? " pede-followup" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                      setArrastando(c.id);
                    }}
                    onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                  >
                    <div className="kanban-cartao-topo">
                      <Link href={c.href} className="kanban-titulo" draggable={false}>{c.titulo}</Link>
                      <Seletor
                        estilo="icone"
                        alinhar="direita"
                        titulo="Mover para"
                        rotuloAcessivel={`Mover ${c.titulo} para outra etapa`}
                        valor={c.status}
                        opcoes={opcoes}
                        onEscolher={(v) => mover(c.id, v as Status)}
                      />
                    </div>
                    <p className="kanban-empresa">{c.empresa}</p>
                    {c.followup && (c.status === "aplicada" || c.status === "enviada") ? (
                      <Link
                        href={c.href}
                        className={`kanban-followup fu-${c.followup}`}
                        draggable={false}
                        title={c.followup === "followup" ? `Passou de ${FOLLOWUP_DIAS} dias sem resposta: abra para fazer o follow-up` : "Já teve 2 follow-ups e segue sem resposta"}
                      >
                        <Icone nome="sino" tamanho={13} />
                        {c.followup === "followup" ? `Follow-up · ${c.diasSemResposta} dias` : `Sem resposta · ${c.diasSemResposta} dias`}
                      </Link>
                    ) : null}
                    <div className="kanban-rodape">
                      {c.nota !== null ? <span className="etiqueta">Nota {Math.round(c.nota)}</span> : null}
                      {c.porEmail ? <span className="etiqueta email"><Icone nome="email" tamanho={12} />Email</span> : <span className="etiqueta">Link</span>}
                      <span className="kanban-quando">{c.quando}</span>
                    </div>
                  </article>
                ))}
                {daEtapa.length === 0 ? <p className="kanban-vazio">Arraste uma vaga para cá</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

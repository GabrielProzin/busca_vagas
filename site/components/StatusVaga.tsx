"use client";

import { useState, useTransition } from "react";
import Seletor from "./Seletor";
import { moverCandidatura } from "@/app/acoes";
import { useAviso } from "./Avisos";
import { useRouter } from "next/navigation";
import { ETAPAS, ROTULO_STATUS, type Status } from "@/lib/tipos";

// Situação da candidatura na página da vaga: escolheu no menu, já salva.
export default function StatusVaga({ id, status }: { id: string; status: Status }) {
  const [atual, setAtual] = useState<Status>(status);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startTransition] = useTransition();
  const aviso = useAviso();
  const router = useRouter();
  const opcoes = [
    { valor: "nova", rotulo: ROTULO_STATUS.nova },
    ...ETAPAS.map((e) => ({ valor: e.status, rotulo: e.rotulo })),
    { valor: "descartada", rotulo: ROTULO_STATUS.descartada },
  ];
  return (
    <div className="form-coluna" style={{ gap: 6 }}>
      <Seletor
        estilo="campo"
        rotuloAcessivel="Situação da candidatura"
        valor={atual}
        opcoes={opcoes}
        desabilitado={salvando}
        onEscolher={(v) => {
          const antes = atual;
          setAtual(v as Status);
          setErro(null);
          startTransition(async () => {
            const falha = await moverCandidatura(id, v as Status);
            if (falha) { setAtual(antes); setErro(falha); return; }
            router.refresh();
            aviso({
              texto: `Situação: ${opcoes.find((o) => o.valor === v)?.rotulo ?? v}`,
              acao: {
                rotulo: "Desfazer",
                fazer: async () => {
                  const e = await moverCandidatura(id, antes);
                  if (e) aviso({ texto: e, tipo: "erro" });
                  router.refresh();
                },
              },
            });
          });
        }}
      />
      {salvando ? <span className="dica">Salvando…</span> : null}
      {erro ? <span className="erro">{erro}</span> : null}
    </div>
  );
}

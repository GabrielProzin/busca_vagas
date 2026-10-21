"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import Icone from "./Icone";
import { useAviso } from "./Avisos";
import { moverCandidatura } from "@/app/acoes";
import type { Status } from "@/lib/tipos";

// "Já apliquei" e "Descartar", com aviso e Desfazer. Na lista: botões de ícone; na página da vaga: botões com texto.
export default function AcoesVaga({ id, titulo, variante = "icones" }: { id: string; titulo: string; variante?: "icones" | "botoes" }) {
  const router = useRouter();
  const aviso = useAviso();
  const [ocupado, startTransition] = useTransition();

  function marcar(status: Status) {
    startTransition(async () => {
      const erro = await moverCandidatura(id, status);
      if (erro) {
        aviso({ texto: erro, tipo: "erro" });
        return;
      }
      router.refresh();
      aviso({
        texto: status === "descartada" ? `Descartada: ${titulo}` : `Marcada como aplicada: ${titulo}`,
        acao: {
          rotulo: "Desfazer",
          fazer: async () => {
            const e = await moverCandidatura(id, "nova");
            if (e) aviso({ texto: e, tipo: "erro" });
            router.refresh();
          },
        },
      });
    });
  }

  if (variante === "botoes") {
    return (
      <>
        <button className="botao fantasma perigo" type="button" disabled={ocupado} onClick={() => marcar("descartada")}>Descartar</button>
        <button className="botao" type="button" disabled={ocupado} onClick={() => marcar("aplicada")}>
          <Icone nome="check" tamanho={16} /> Já apliquei
        </button>
      </>
    );
  }
  return (
    <>
      <button className="icone-botao ok" type="button" disabled={ocupado} onClick={() => marcar("aplicada")} title="Já apliquei" aria-label={`Marcar ${titulo} como aplicada`}>
        <Icone nome="check" />
      </button>
      <button className="icone-botao perigo" type="button" disabled={ocupado} onClick={() => marcar("descartada")} title="Descartar" aria-label={`Descartar ${titulo}`}>
        <Icone nome="x" />
      </button>
    </>
  );
}

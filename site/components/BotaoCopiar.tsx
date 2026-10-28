"use client";

import { useState } from "react";
import Icone from "./Icone";

/** Copia um texto e confirma por 2 segundos (respostas do formulário). */
export default function BotaoCopiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="botao fantasma pequeno"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          setOk(false);
        }
      }}
    >
      <Icone nome={ok ? "check" : "copiar"} tamanho={15} /> {ok ? "Copiado" : rotulo}
      <span className="sr-only" aria-live="polite">{ok ? "Resposta copiada" : ""}</span>
    </button>
  );
}

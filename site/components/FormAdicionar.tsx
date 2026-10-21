"use client";

import { useActionState } from "react";
import { adicionarVaga, type EstadoEmail } from "@/app/acoes";

export default function FormAdicionar() {
  const [estado, acao, lendo] = useActionState<EstadoEmail, FormData>(adicionarVaga, null);
  return (
    <form action={acao} className="formulario">
      <label>
        Texto da vaga
        <textarea name="texto" required placeholder="Cole aqui o post inteiro, incluindo o email para envio do currículo." />
      </label>
      <label>
        Link do post (opcional)
        <input type="url" name="url" placeholder="https://www.linkedin.com/posts/…" />
      </label>
      <div className="email-rodape">
        <span className="dica">Leva alguns segundos: a IA lê o texto e compara com o seu currículo.</span>
        <button className="botao primario" type="submit" disabled={lendo}>
          {lendo ? "Lendo a vaga…" : "Adicionar e avaliar"}
        </button>
      </div>
      {estado?.erro ? <p className="erro" role="alert">{estado.erro}</p> : null}
    </form>
  );
}

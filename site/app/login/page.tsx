"use client";

import { useActionState } from "react";
import { entrar } from "../acoes";

export default function Login() {
  const [estado, acao, enviando] = useActionState(entrar, null);
  return (
    <main className="login">
      <div className="cartao">
        <form action={acao}>
          <span className="marca">
            <span className="marca-simbolo" aria-hidden><i /><i /><i /></span>
            busca_vagas
          </span>
          <div>
            <h1>Entrar</h1>
            <p className="dica">Radar pessoal de vagas.</p>
          </div>
          <label htmlFor="senha" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Senha
            <input id="senha" name="senha" type="password" autoComplete="current-password" required autoFocus />
          </label>
          {estado?.erro ? <p className="erro" role="alert">{estado.erro}</p> : null}
          <button className="botao primario" type="submit" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}

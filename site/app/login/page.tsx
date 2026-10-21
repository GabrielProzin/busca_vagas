"use client";

import { useActionState } from "react";
import { entrar } from "../acoes";

export default function Login() {
  const [estado, acao, enviando] = useActionState(entrar, null);
  return (
    <main className="login">
      <form action={acao}>
        <div className="marca">
          busca<span>_</span>vagas
        </div>
        <label htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" required autoFocus />
        {estado?.erro ? <p className="erro" role="alert">{estado.erro}</p> : null}
        <button className="botao primario" type="submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

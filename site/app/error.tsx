"use client";

import { useEffect } from "react";

// Erro inesperado numa página: mensagem simples e botão para tentar de novo (o detalhe fica no log).
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="pagina">
      <div className="cartao vazio">
        <b>Algo deu errado nesta página.</b>
        <p>Já ficou registrado no log. Tente de novo; se continuar, volte para a lista de vagas.</p>
        {error.digest ? <p className="dica">Código do erro: {error.digest}</p> : null}
        <div className="linha-botoes" style={{ justifyContent: "center" }}>
          <button className="botao primario" onClick={() => reset()}>Tentar de novo</button>
          <a className="botao" href="/">Ir para as vagas</a>
        </div>
      </div>
    </main>
  );
}

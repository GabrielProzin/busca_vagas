import Link from "next/link";

export default function NaoEncontrada() {
  return (
    <main className="pagina">
      <div className="cartao vazio">
        <b>Página não encontrada.</b>
        <p>A vaga pode ter saído da lista (as fontes removem vagas antigas) ou o link está incompleto.</p>
        <div className="linha-botoes" style={{ justifyContent: "center" }}>
          <Link className="botao primario" href="/vagas">Ir para as vagas</Link>
          <Link className="botao" href="/candidaturas">Minhas candidaturas</Link>
        </div>
      </div>
    </main>
  );
}

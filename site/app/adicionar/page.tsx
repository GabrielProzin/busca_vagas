import Topo from "@/components/Topo";
import FormAdicionar from "@/components/FormAdicionar";

export default function PaginaAdicionar() {
  return (
    <>
      <Topo atual="/adicionar" />
      <main className="conteudo">
        <div className="cabecalho">
          <div>
            <h1>Adicionar vaga</h1>
            <p className="sub">Cole o texto de um post ou anúncio. A IA separa cargo, empresa e email e dá a nota contra o seu currículo.</p>
          </div>
        </div>
        <FormAdicionar />
      </main>
    </>
  );
}

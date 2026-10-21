import Moldura from "@/components/Moldura";
import { PERFIL } from "@/lib/gerado/perfil";
import Icone from "@/components/Icone";
import FormAdicionar from "@/components/FormAdicionar";

// Buscas prontas de POSTS no LinkedIn (onde ficam as vagas com email do recrutador), das últimas 24h.
// Você abre, rola e clica no ícone da extensão: ela manda de uma vez os posts da tela que têm email.
// As duas primeiras são as que mais renderam email no teste de 21/10.
const BUSCAS = [
  { rotulo: "Currículo + analista de dados", q: "currículo analista de dados" },
  { rotulo: "Currículo + engenheiro de dados", q: "currículo engenheiro de dados" },
  { rotulo: "Analista de dados júnior", q: '"analista de dados" (júnior OR jr) (currículo OR CV) (email OR "e-mail")' },
  { rotulo: "BI / Power BI", q: '("analista de BI" OR "power bi") (currículo OR CV) (email OR "e-mail")' },
  { rotulo: "Engenharia de dados", q: '("engenheiro de dados" OR "engenharia de dados") (júnior OR jr) (currículo OR CV)' },
  { rotulo: "Ciência de dados", q: '("cientista de dados" OR "ciência de dados") (júnior OR jr) (currículo OR CV)' },
  ...(PERFIL.regiao ? [{ rotulo: `Dados em ${PERFIL.regiao}`, q: `(dados OR BI) ${PERFIL.regiao} vaga (currículo OR CV)` }] : []),
];

function urlLinkedIn(q: string): string {
  const p = new URLSearchParams({ keywords: q, datePosted: '"past-24h"', sortBy: '"date_posted"' });
  return `https://www.linkedin.com/search/results/content/?${p.toString()}`;
}

export default function PaginaAdicionar() {
  return (
    <Moldura
      atual="/adicionar"
      titulo="Adicionar vaga"
      subtitulo="Cole o texto de um post ou anúncio. A IA separa cargo, empresa e email e dá a nota contra o seu currículo."
    >
      <div className="detalhe">
        <section className="cartao">
          <div className="cartao-cabecalho"><h2><Icone nome="arquivo" /> Texto da vaga</h2></div>
          <div className="cartao-corpo"><FormAdicionar /></div>
        </section>

        <aside className="lado">
          <section className="cartao">
            <div className="cartao-cabecalho"><h2><Icone nome="linkedin" /> Posts com email no LinkedIn</h2></div>
            <div className="cartao-corpo form-coluna">
              <p className="dica">
                Buscas prontas das últimas 24 horas. Abra uma, role a página por alguns segundos para carregar os posts e
                clique no <b>ícone da extensão</b>: ela manda de uma vez os posts da tela que têm email e cara de vaga, e só
                entram as vagas {PERFIL.area} no seu local. Pode rolar mais e clicar de novo; o que já foi enviado não repete.
              </p>
              <p className="dica">A busca automática da coleta já faz algo parecido duas vezes por dia; isto é para quando você quiser mais.</p>
              <div className="form-coluna" style={{ gap: 6, marginTop: 4 }}>
                {BUSCAS.map((b) => (
                  <a key={b.rotulo} className="botao" style={{ justifyContent: "space-between" }} href={urlLinkedIn(b.q)} target="_blank" rel="noopener noreferrer">
                    {b.rotulo} <Icone nome="externo" tamanho={15} />
                  </a>
                ))}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </Moldura>
  );
}

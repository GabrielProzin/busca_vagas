import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import EnviarPdf from "@/components/EnviarPdf";
import { passosConfiguracao, urlRepositorio } from "@/lib/configuracao";

export const dynamic = "force-dynamic";

export default async function PaginaConfiguracoes() {
  const [passos, repo] = [await passosConfiguracao(), urlRepositorio()];
  const faltam = passos.filter((p) => !p.ok);
  const essenciaisFaltando = faltam.filter((p) => p.essencial).length;
  const limite = Number(process.env.LIMITE_DIARIO_EMAILS ?? 40);

  return (
    <Moldura atual="/configuracoes" titulo="Configurações" subtitulo="O que o site precisa para encontrar vagas e mandar candidaturas por você.">
      <section className="cartao">
        <div className="ajuste">
          <div>
            <h2>Primeiros passos</h2>
            <p className="dica">
              {faltam.length === 0
                ? "Tudo pronto."
                : essenciaisFaltando
                  ? `${essenciaisFaltando === 1 ? "Falta 1 passo essencial" : `Faltam ${essenciaisFaltando} passos essenciais`} para o básico funcionar.`
                  : "O básico está pronto. O que falta é opcional."}
            </p>
            <div className="progresso-passos" role="img" aria-label={`${passos.length - faltam.length} de ${passos.length} prontos`}>
              <i style={{ width: `${Math.round(((passos.length - faltam.length) / passos.length) * 100)}%` }} />
            </div>
            <p className="dica">{passos.length - faltam.length} de {passos.length} prontos</p>
          </div>
          <div>
            <ul className="passos">
              {[...passos].sort((a, b) => Number(a.ok) - Number(b.ok) || Number(b.essencial) - Number(a.essencial)).map((p) => (
                <li key={p.id} className={p.ok ? "pronto" : p.essencial ? "falta essencial" : "falta"}>
                  <span className={`selo ${p.ok ? "sim" : "nao"}`} aria-hidden>
                    <Icone nome={p.ok ? "check" : "alerta"} tamanho={13} />
                  </span>
                  <div>
                    <b>{p.rotulo}</b>
                    {!p.ok && !p.essencial ? <span className="etiqueta" style={{ marginLeft: 8 }}>opcional</span> : null}
                    <p className="dica">{p.detalhe}</p>
                    {!p.ok && p.ancora && repo ? (
                      <a className="link-passo" href={`${repo}#${p.ancora}`} target="_blank" rel="noopener noreferrer">
                        Como fazer <Icone nome="externo" tamanho={13} />
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <p className="dica" style={{ marginTop: 12 }}>
              Limite de {limite} emails por dia (variável LIMITE_DIARIO_EMAILS), para o Gmail não bloquear sua conta.
            </p>
          </div>
        </div>

        <div className="ajuste">
          <div>
            <h2>Currículo anexado</h2>
            <p className="dica">Vai em PDF em todo email enviado. Fica num armazenamento privado do seu Supabase; enviar um novo substitui o anterior.</p>
          </div>
          <EnviarPdf />
        </div>

        <div className="ajuste">
          <div>
            <h2>Seus dados e backup</h2>
            <p className="dica">
              A cada coleta, o GitHub guarda um backup cifrado do banco por 14 dias (só abre com a BACKUP_SENHA). Aqui você baixa uma
              cópia legível de todas as suas candidaturas, quando quiser.
            </p>
          </div>
          <div className="form-coluna">
            <a className="botao" href="/api/exportar" download>
              <Icone nome="arquivo" tamanho={16} /> Exportar meus dados (JSON)
            </a>
          </div>
        </div>

        <div className="ajuste">
          <div>
            <h2>Extensão do navegador</h2>
            <p className="dica">Mande posts de vaga do LinkedIn (ou de qualquer site) para cá com o botão direito.</p>
          </div>
          <div className="form-coluna">
            <p>
              A extensão está na pasta <code>extensao/</code> do repositório. No Chrome, abra <code>chrome://extensions</code>, ative o
              Modo do desenvolvedor, clique em Carregar sem compactação e escolha a pasta. Nas opções da extensão, informe o endereço
              deste site e o mesmo valor de CAPTURA_TOKEN.
            </p>
            <p className="dica">
              No LinkedIn, clique no ícone da extensão para mandar de uma vez os posts da tela com email. Em qualquer site, selecione o
              texto de uma vaga, clique com o botão direito e escolha “Enviar para o busca_vagas”.
            </p>
          </div>
        </div>
      </section>
    </Moldura>
  );
}

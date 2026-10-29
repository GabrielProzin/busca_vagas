import Link from "next/link";
import { PERFIL } from "@/lib/gerado/perfil";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import EnviarPdf from "@/components/EnviarPdf";
import BotaoCopiar from "@/components/BotaoCopiar";
import { BotaoAtualizar } from "@/components/Instalacao";
import { passosConfiguracao, urlRepositorio } from "@/lib/configuracao";
import { lerSegredos } from "@/lib/segredos";
import { ORIGEM, REPO, verificarAtualizacao } from "@/lib/github";
import { VERSAO } from "@/lib/gerado/versao";

const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

export const dynamic = "force-dynamic";

export default async function PaginaConfiguracoes() {
  const [passos, seg, versao] = await Promise.all([
    passosConfiguracao(),
    lerSegredos(),
    verificarAtualizacao(VERSAO).catch(() => ({ nova: false, resumo: null, data: null })),
  ]);
  const repo = urlRepositorio();
  const original = Boolean(REPO) && REPO.toLowerCase() === ORIGEM.toLowerCase();
  const dataVersao = VERSAO.split(" ")[1];
  const faltam = passos.filter((p) => !p.ok);
  const essenciaisFaltando = faltam.filter((p) => p.essencial).length;
  const limite = PERFIL.envio.limiteDiario;

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
                    {!p.ok && p.link ? (
                      <Link className="link-passo" href={p.link}>Ajustar agora <Icone nome="voltar" tamanho={13} className="seta-direita" /></Link>
                    ) : null}
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
              Limite de {limite} emails por dia, somando o site e a fila (envio.limite_diario em config/preferencias.yaml), para o Gmail não bloquear sua conta.
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

        {!original ? (
          <div className="ajuste">
            <div>
              <h2>Atualizações</h2>
              <p className="dica">
                Melhorias novas do PerfilUp chegam por aqui. Seu perfil, currículo e preferências nunca são tocados. Se você mudou
                um arquivo que também mudou na versão nova, nada é sobrescrito: abre um Pull Request no seu repositório para você decidir.
              </p>
            </div>
            <div className="form-coluna">
              {!seg.GITHUB_DISPATCH_TOKEN ? (
                <p>Ligue o GitHub no <Link href="/instalar">assistente de instalação</Link> para receber atualizações.</p>
              ) : versao.nova ? (
                <>
                  <p className="aviso" role="status">
                    <Icone nome="sobe" tamanho={15} /> Versão nova de {versao.data ? fmtData.format(new Date(versao.data)) : "agora"}
                    {versao.resumo ? <>: “{versao.resumo}”</> : null}
                  </p>
                  <BotaoAtualizar />
                </>
              ) : (
                <p className="aviso ok"><Icone nome="check" tamanho={15} /> Você está na versão mais nova{dataVersao ? ` (${fmtData.format(new Date(dataVersao))})` : ""}.</p>
              )}
            </div>
          </div>
        ) : null}

        <div className="ajuste">
          <div>
            <h2>Extensão do navegador</h2>
            <p className="dica">Mande posts de vaga do LinkedIn (ou de qualquer site) para cá com o botão direito.</p>
          </div>
          <div className="form-coluna">
            <p>
              A extensão está na pasta <code>extensao/</code> do repositório. No Chrome, abra <code>chrome://extensions</code>, ative o
              Modo do desenvolvedor, clique em Carregar sem compactação e escolha a pasta. Nas opções da extensão, informe o endereço
              deste site e o token abaixo.
            </p>
            {seg.CAPTURA_TOKEN ? (
              <details className="inst-token">
                <summary>Mostrar o token da extensão</summary>
                <div className="inst-segredo"><code>{seg.CAPTURA_TOKEN}</code><BotaoCopiar texto={seg.CAPTURA_TOKEN} rotulo="Copiar" /></div>
              </details>
            ) : (
              <p className="dica">O token é criado quando você liga o GitHub no <Link href="/instalar">assistente de instalação</Link>.</p>
            )}
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

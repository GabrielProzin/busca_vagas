import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import EnviarPdf from "@/components/EnviarPdf";
import { infoCurriculo } from "@/lib/arquivos";
import { gmailConfigurado } from "@/lib/email";
import { iaConfigurada } from "@/lib/ia";

export const dynamic = "force-dynamic";

export default async function PaginaConfiguracoes() {
  const cv = await infoCurriculo().catch(() => null);
  const itens = [
    { ok: Boolean(cv), texto: cv ? `Currículo em PDF salvo${cv.atualizado ? ` em ${new Date(cv.atualizado).toLocaleDateString("pt-BR")}` : ""}` : "Currículo em PDF ainda não enviado" },
    { ok: gmailConfigurado(), texto: gmailConfigurado() ? `Gmail pronto para enviar (${process.env.GMAIL_USER})` : "Gmail: falta GMAIL_USER e GMAIL_APP_PASSWORD na Vercel" },
    { ok: iaConfigurada(), texto: iaConfigurada() ? "IA (Gemini) pronta para escrever emails, resumir vagas e ler posts" : "IA: falta GEMINI_API_KEY na Vercel" },
    { ok: Boolean(process.env.CAPTURA_TOKEN), texto: process.env.CAPTURA_TOKEN ? "Extensão do navegador liberada" : "Extensão: falta CAPTURA_TOKEN na Vercel" },
  ];
  const limite = Number(process.env.LIMITE_DIARIO_EMAILS ?? 40);

  return (
    <Moldura atual="/configuracoes" titulo="Configurações" subtitulo="O que o site precisa para escrever e enviar candidaturas por você.">
      <section className="cartao">
        <div className="ajuste">
          <div>
            <h2>Situação</h2>
            <p className="dica">Tudo verde = pronto para enviar candidaturas.</p>
          </div>
          <div>
            <ul className="situacao">
              {itens.map((i) => (
                <li key={i.texto}>
                  <span className={`selo ${i.ok ? "sim" : "nao"}`} aria-hidden>
                    <Icone nome={i.ok ? "check" : "alerta"} tamanho={13} />
                  </span>
                  <span>{i.texto}</span>
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

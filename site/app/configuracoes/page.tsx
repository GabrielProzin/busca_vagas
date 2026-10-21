import Topo from "@/components/Topo";
import EnviarPdf from "@/components/EnviarPdf";
import { infoCurriculo } from "@/lib/arquivos";
import { gmailConfigurado } from "@/lib/email";
import { iaConfigurada } from "@/lib/ia";

export const dynamic = "force-dynamic";

export default async function PaginaConfiguracoes() {
  const cv = await infoCurriculo().catch(() => null);
  const itens = [
    { ok: Boolean(cv), texto: cv ? `Currículo em PDF salvo${cv.atualizado ? ` (${new Date(cv.atualizado).toLocaleDateString("pt-BR")})` : ""}` : "Currículo em PDF ainda não enviado" },
    { ok: gmailConfigurado(), texto: gmailConfigurado() ? `Gmail pronto para enviar (${process.env.GMAIL_USER})` : "Gmail: falta GMAIL_USER e GMAIL_APP_PASSWORD na Vercel" },
    { ok: iaConfigurada(), texto: iaConfigurada() ? "IA (Gemini) pronta para escrever emails e ler posts" : "IA: falta GEMINI_API_KEY na Vercel" },
    { ok: Boolean(process.env.CAPTURA_TOKEN), texto: process.env.CAPTURA_TOKEN ? "Extensão do navegador liberada (CAPTURA_TOKEN definido)" : "Extensão: falta CAPTURA_TOKEN na Vercel" },
  ];
  const limite = Number(process.env.LIMITE_DIARIO_EMAILS ?? 40);

  return (
    <>
      <Topo atual="/configuracoes" />
      <main className="conteudo">
        <div className="cabecalho">
          <div>
            <h1>Configurações</h1>
            <p className="sub">O que o site precisa para escrever e enviar candidaturas por você.</p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section className="secao">
            <h2>Situação</h2>
            <ul className="situacao">
              {itens.map((i) => (
                <li key={i.texto}>
                  <span className={i.ok ? "sim" : "nao"} aria-hidden>{i.ok ? "✓" : "!"}</span>
                  <span>{i.texto}</span>
                </li>
              ))}
            </ul>
            <p className="dica">Limite de envio: {limite} emails por dia (variável LIMITE_DIARIO_EMAILS), para o Gmail não bloquear sua conta.</p>
          </section>

          <section className="secao">
            <h2>Currículo anexado nos emails</h2>
            <p className="dica">Fica num armazenamento privado do seu Supabase. Enviar um novo substitui o anterior.</p>
            <EnviarPdf />
          </section>

          <section className="secao">
            <h2>Extensão “Enviar para o busca_vagas”</h2>
            <p>
              Na pasta <code>extensao/</code> do repositório. No Chrome: <code>chrome://extensions</code> → ative o Modo do desenvolvedor →
              Carregar sem compactação → escolha a pasta. Nas opções da extensão, informe o endereço deste site e o mesmo valor de CAPTURA_TOKEN.
            </p>
            <p className="dica">Para usar: selecione o texto de um post de vaga, clique com o botão direito e escolha “Enviar para o busca_vagas”.</p>
          </section>
        </div>
      </main>
    </>
  );
}

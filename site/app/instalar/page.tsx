import Link from "next/link";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import { Passo, PassoBanco, PassoColeta, PassoGemini, PassoGitHub, PassoGmail, PassoPerfil } from "@/components/Instalacao";
import { SCHEMA_SQL, estadoInstalacao } from "@/lib/instalacao";
import { linkNovoToken } from "@/lib/github";
import { supabaseUrl } from "@/lib/ambiente";

export const dynamic = "force-dynamic";

/** Link do SQL Editor do projeto no Supabase (https://abcd.supabase.co → projeto abcd). */
function editorSql(): string | null {
  const m = supabaseUrl().match(/^https:\/\/([a-z0-9]+)\.supabase\.co/);
  return m ? `https://supabase.com/dashboard/project/${m[1]}/sql/new` : null;
}

// Assistente de instalação: do site recém-criado pelo botão da Vercel até a primeira coleta, sem mexer em
// variáveis nem em arquivos (docs/spec.md, "Instalação").
export default async function PaginaInstalar() {
  const e = await estadoInstalacao();
  const ordem = [e.banco.ok, e.gemini.ok, e.gmail.ok, e.github.ok, e.perfil.ok, e.preferencias.ok, e.coleta.ok];
  const vez = ordem.findIndex((ok) => !ok); // o primeiro que falta abre sozinho
  const tudo = vez === -1;

  return (
    <Moldura
      atual="/instalar"
      titulo="Instalação"
      subtitulo="Sete passos, uns 15 minutos. Cada chave é testada antes de salvar e fica guardada cifrada no seu banco."
    >
      <section className="cartao inst-topo" aria-label="Andamento">
        <div>
          <b>{tudo ? "Tudo pronto." : `${e.prontos} de ${e.total} passos prontos`}</b>
          <p className="dica">
            {tudo
              ? "A coleta roda sozinha 5 vezes por dia. Você pode voltar aqui quando quiser trocar uma chave."
              : e.essencial
                ? "O básico já funciona. O que falta deixa tudo mais completo."
                : "Siga na ordem: cada passo usa o anterior."}
          </p>
        </div>
        <div className="progresso-passos" role="img" aria-label={`${e.prontos} de ${e.total} prontos`}>
          <i style={{ width: `${Math.round((e.prontos / e.total) * 100)}%` }} />
        </div>
      </section>

      <ol className="inst-passos">
        <Passo n={1} titulo="Banco de dados" resumo="Onde ficam as vagas e as suas candidaturas (Supabase, grátis)" ok={e.banco.ok} vez={vez === 0}>
          <PassoBanco ok={e.banco.ok} podeCriar={e.banco.podeCriar} sql={SCHEMA_SQL} editor={editorSql()} />
        </Passo>
        <Passo n={2} titulo="IA do Google (Gemini)" resumo="Lê o seu currículo, resume as vagas e escreve os emails. Grátis" ok={e.gemini.ok} vez={vez === 1}>
          <PassoGemini ok={e.gemini.ok} fixo={e.gemini.fixo} />
        </Passo>
        <Passo n={3} titulo="Gmail" resumo="Para enviar as candidaturas do seu próprio email" ok={e.gmail.ok} vez={vez === 2}>
          <PassoGmail ok={e.gmail.ok} fixo={e.gmail.fixo} usuario={e.gmail.usuario} telefone={e.gmail.telefone} />
        </Passo>
        <Passo n={4} titulo="GitHub" resumo="Liga a coleta automática e guarda o seu perfil no repositório" ok={e.github.ok} vez={vez === 3}
          bloqueado={!e.github.repo ? "O site não sabe qual é o seu repositório. Ele precisa ter sido criado pelo botão da Vercel (ou defina GITHUB_REPO=dono/nome na Vercel)." : null}>
          <PassoGitHub ok={e.github.ok} repo={e.github.repo} link={linkNovoToken()} />
        </Passo>
        <Passo n={5} titulo="Seu perfil" resumo="A IA monta a partir do seu currículo em PDF; você confere" ok={e.perfil.ok} vez={vez === 4}
          bloqueado={!e.gemini.ok || !e.github.ok ? "Faça antes os passos 2 (Gemini) e 4 (GitHub): a IA lê o currículo e o perfil fica salvo no repositório." : null}>
          <PassoPerfil ok={e.perfil.ok} nome={e.perfil.nome} />
        </Passo>
        <Passo n={6} titulo="Preferências da busca" resumo="Remoto, híbrido ou presencial, cidades, nível e termos de busca" ok={e.preferencias.ok} vez={vez === 5}>
          <p>Diga onde aceita trabalhar e o que buscar. Dá para mudar quando quiser.</p>
          <div><Link className="botao primario" href="/preferencias">Abrir as preferências <Icone nome="voltar" tamanho={14} className="seta-direita" /></Link></div>
        </Passo>
        <Passo n={7} titulo="Primeira coleta" resumo="Busca as primeiras vagas para você" ok={e.coleta.ok} vez={vez === 6}
          bloqueado={!e.github.ok || !e.perfil.ok ? "Faça antes os passos 4 (GitHub) e 5 (perfil): a coleta roda no GitHub e dá a nota pelo seu perfil." : null}>
          <PassoColeta ok={e.coleta.ok} estadoGitHub={e.coleta.execucao?.estado ?? null} url={e.coleta.execucao?.url ?? null} />
        </Passo>
      </ol>

      <p className="dica inst-rodape">
        Prefere configurar à mão? Tudo também funciona com variáveis de ambiente na Vercel e secrets no GitHub, como explica o README.
        O que estiver na Vercel vale mais que o que foi salvo aqui.
      </p>
    </Moldura>
  );
}

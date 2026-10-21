import { PERFIL } from "./gerado/perfil";
import type { UsoDiario, UsoServico } from "./tipos";

// Monta os cartões da página "Uso dos serviços" a partir das medições (coletor/uso.py) e dos contadores do dia.
// Os limites são os dos planos grátis; os do Gemini mudam de tempos em tempos, por isso são aproximados.

export const LIMITES = {
  geminiFlashDia: 20, // aprox.: escrita de emails e follow-ups
  geminiLiteDia: 500, // aprox.: resumos e leitura de posts
  gmailDia: 500, // limite do Gmail para contas pessoais (envios em 24h)
  supabasePausaDias: 7, // o projeto grátis pausa depois de 7 dias sem uso
};

export type Estado = "ok" | "atencao" | "critico" | "sem";
export type Barra = { rotulo: string; usado: number; limite: number | null; texto: string };
export type CartaoUso = {
  id: string;
  nome: string;
  para: string;
  estado: Estado;
  fracao: number | null;
  barras: Barra[];
  linhas: string[];
  medidoEm: string | null;
  link: { href: string; rotulo: string };
};

const fmtHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const fmtDia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const mb = (b: number) => (b >= 1e9 ? `${(b / 2 ** 30).toFixed(2)} GB` : `${(b / 2 ** 20).toFixed(b < 10 * 2 ** 20 ? 2 : 1)} MB`).replace(".", ",");
const usd = (x: number) => `US$ ${x.toFixed(2).replace(".", ",")}`;
const pct = (f: number) => `${Math.round(f * 100)}%`;

function estadoDe(f: number | null): Estado {
  if (f === null) return "sem";
  return f >= 0.8 ? "critico" : f >= 0.6 ? "atencao" : "ok"; // 80%: mesma linha do alerta por email
}

function dia(fuso: string, d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: fuso });
}

type Entrada = {
  servicos: UsoServico[];
  diario: UsoDiario[];
  ultimaColeta: string | null;
  emailsCandidaturaHoje: number;
  agora?: Date;
};

export function montarUso({ servicos, diario, ultimaColeta, emailsCandidaturaHoje, agora = new Date() }: Entrada): CartaoUso[] {
  const s = (id: string) => servicos.find((x) => x.servico === id);
  const soma = (diaAlvo: string, prefixo: string, exato = false) =>
    diario.filter((d) => d.dia === diaAlvo && (exato ? d.chave === prefixo : d.chave.startsWith(prefixo))).reduce((a, d) => a + Number(d.n), 0);
  const cartoes: CartaoUso[] = [];

  // GitHub Actions
  const gh = s("github");
  if (gh) {
    const d = gh.dados as { privado: boolean; minutos: number; limite: number | null; execucoes: number; por_workflow: Record<string, number> };
    const diaMes = agora.getUTCDate();
    const diasMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0)).getUTCDate();
    const previsto = Math.round((d.minutos / Math.max(1, diaMes)) * diasMes);
    const f = d.limite ? d.minutos / d.limite : null;
    cartoes.push({
      id: "github", nome: "GitHub Actions", para: "Coletas, envio da fila e testes",
      estado: d.limite ? estadoDe(Math.max(f!, previsto / d.limite >= 1 ? 0.7 : 0)) : "ok", fracao: f,
      barras: [{ rotulo: "Minutos no mês", usado: d.minutos, limite: d.limite, texto: d.limite ? `${d.minutos} de ${d.limite} min` : `${d.minutos} min` }],
      linhas: [
        d.limite ? `No ritmo atual, fecha o mês com uns ${previsto} min.` : "Repositório público: minutos sem limite no plano grátis.",
        `${d.execucoes} execuções neste mês: ` + Object.entries(d.por_workflow ?? {}).sort((a, b) => b[1] - a[1]).map(([w, m]) => `${w} ${m} min`).join(", "),
      ],
      medidoEm: gh.atualizado_em,
      link: { href: "https://github.com/settings/billing", rotulo: "Uso no GitHub" },
    });
  }

  // Supabase
  const sb = s("supabase");
  const horasSemColeta = ultimaColeta ? (agora.getTime() - Date.parse(ultimaColeta)) / 36e5 : null;
  if (sb) {
    const d = sb.dados as { banco_bytes: number; banco_limite: number; arquivos_bytes: number; arquivos_limite: number };
    const f = Math.max(d.banco_bytes / d.banco_limite, d.arquivos_bytes / d.arquivos_limite);
    cartoes.push({
      id: "supabase", nome: "Supabase", para: "Banco de dados e o PDF do currículo",
      estado: estadoDe(horasSemColeta !== null && horasSemColeta > 5 * 24 ? Math.max(f, 0.9) : f), fracao: f,
      barras: [
        { rotulo: "Banco", usado: d.banco_bytes, limite: d.banco_limite, texto: `${mb(d.banco_bytes)} de ${mb(d.banco_limite)}` },
        { rotulo: "Arquivos", usado: d.arquivos_bytes, limite: d.arquivos_limite, texto: `${mb(d.arquivos_bytes)} de ${mb(d.arquivos_limite)}` },
      ],
      linhas: [
        horasSemColeta === null
          ? "O projeto grátis pausa depois de 7 dias sem uso: as coletas evitam isso."
          : `Pausa depois de ${LIMITES.supabasePausaDias} dias sem uso. Última coleta há ${horasSemColeta < 1 ? "menos de 1 hora" : `${Math.round(horasSemColeta)} h`}: ${horasSemColeta > 5 * 24 ? "atenção!" : "tudo certo."}`,
      ],
      medidoEm: sb.atualizado_em,
      link: { href: "https://supabase.com/dashboard/project/_/settings/billing/usage", rotulo: "Uso no Supabase" },
    });
  }

  // Apify
  const ap = s("apify");
  if (ap) {
    const d = ap.dados as { usado_usd: number; limite_usd: number; ciclo_inicio: string | null; ciclo_fim: string | null };
    const f = d.limite_usd ? d.usado_usd / d.limite_usd : null;
    let previsao = "";
    if (d.ciclo_inicio && d.ciclo_fim) {
      const ini = Date.parse(d.ciclo_inicio), fim = Date.parse(d.ciclo_fim);
      const passado = Math.max(1, (agora.getTime() - ini) / 864e5), total = (fim - ini) / 864e5;
      const prev = (d.usado_usd / passado) * total;
      previsao = `No ritmo atual, o ciclo fecha em ${usd(prev)} (${pct(prev / d.limite_usd)} do crédito). Renova em ${fmtDia.format(new Date(fim + 1000))}.`;
    }
    cartoes.push({
      id: "apify", nome: "Apify", para: "Busca de posts do LinkedIn (só nas coletas completas)",
      estado: estadoDe(f), fracao: f,
      barras: [{ rotulo: "Crédito do mês", usado: d.usado_usd, limite: d.limite_usd, texto: `${usd(d.usado_usd)} de ${usd(d.limite_usd)}` }],
      linhas: [previsao || "Crédito grátis de US$ 5 por mês.", "Se o crédito acabar, só a busca do LinkedIn para até o ciclo renovar; o resto segue."],
      medidoEm: ap.atualizado_em,
      link: { href: "https://console.apify.com/billing", rotulo: "Uso no Apify" },
    });
  }

  // Gemini (contado pelo site; o dia é o do Pacífico)
  const hojeP = dia("America/Los_Angeles", agora);
  const flash = soma(hojeP, "gemini:flash", true), lite = soma(hojeP, "gemini:lite", true);
  const esgotou = soma(hojeP, "gemini:flash:limite", true) + soma(hojeP, "gemini:lite:limite", true);
  const tokens = soma(hojeP, "gemini:tokens", true);
  const fGem = Math.max(flash / LIMITES.geminiFlashDia, lite / LIMITES.geminiLiteDia);
  const semana = [...new Set(diario.filter((d) => d.chave === "gemini:flash" || d.chave === "gemini:lite").map((d) => d.dia))]
    .reduce((a, x) => a + soma(x, "gemini:flash", true) + soma(x, "gemini:lite", true), 0);
  cartoes.push({
    id: "gemini", nome: "Gemini (IA)", para: "Escrever emails, resumir vagas e ler posts",
    estado: estadoDe(esgotou ? Math.max(fGem, 0.9) : fGem), fracao: fGem,
    barras: [
      { rotulo: "Flash hoje (escrita)", usado: flash, limite: LIMITES.geminiFlashDia, texto: `${flash} de ~${LIMITES.geminiFlashDia} pedidos` },
      { rotulo: "Flash-Lite hoje", usado: lite, limite: LIMITES.geminiLiteDia, texto: `${lite} de ~${LIMITES.geminiLiteDia} pedidos` },
    ],
    linhas: [
      esgotou ? `A cota acabou ${esgotou} vez(es) hoje: o site usou o Flash-Lite ou o modelo pronto no lugar.` : "A cota não acabou hoje.",
      `${tokens.toLocaleString("pt-BR")} tokens hoje · ${semana} pedidos nos últimos 8 dias. A cota zera por volta das 4h ou 5h (meia-noite na Califórnia).`,
    ],
    medidoEm: null,
    link: { href: "https://aistudio.google.com/usage", rotulo: "Uso no AI Studio" },
  });

  // Gmail (contado por quem envia; dia de Brasília)
  const hojeBR = dia("America/Sao_Paulo", agora);
  const gm = (k: string) => soma(hojeBR, `gmail:${k}`, true);
  const totalGmail = soma(hojeBR, "gmail:");
  const lim = PERFIL.envio.limiteDiario;
  cartoes.push({
    id: "gmail", nome: "Gmail", para: "Emails de candidatura, follow-ups, resumo e alertas",
    estado: estadoDe(Math.max(totalGmail / LIMITES.gmailDia, emailsCandidaturaHoje / lim >= 1 ? 0.7 : 0)),
    fracao: totalGmail / LIMITES.gmailDia,
    barras: [
      { rotulo: "Candidaturas hoje (seu limite)", usado: emailsCandidaturaHoje, limite: lim, texto: `${emailsCandidaturaHoje} de ${lim}` },
      { rotulo: "Todos os emails hoje (limite do Gmail)", usado: totalGmail, limite: LIMITES.gmailDia, texto: `${totalGmail} de ${LIMITES.gmailDia}` },
    ],
    linhas: [`Hoje: ${gm("site")} pelo site, ${gm("fila")} pela fila, ${gm("resumo")} resumo(s), ${gm("alerta")} alerta(s).`],
    medidoEm: null,
    link: { href: "https://mail.google.com/mail/u/0/#sent", rotulo: "Enviados no Gmail" },
  });

  // Vercel: sem medição automática (a API de uso pede um token de conta)
  cartoes.push({
    id: "vercel", nome: "Vercel", para: "O site",
    estado: "sem", fracao: null, barras: [],
    linhas: [
      "Não dá para medir daqui sem dar ao site um token da sua conta. Para uma pessoa só, o plano Hobby sobra: o site usa uma fração mínima da banda e das funções.",
      "Os 2 crons do vigia rodam 1 vez por dia cada (é o máximo do plano grátis).",
    ],
    medidoEm: null,
    link: { href: "https://vercel.com/dashboard/usage", rotulo: "Uso na Vercel" },
  });

  return cartoes;
}

export function medidoEm(iso: string | null): string {
  return iso ? `Medido em ${fmtHora.format(new Date(iso))}` : "Contado a cada uso";
}

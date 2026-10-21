import { PERFIL } from "./gerado/perfil";
import type { UsoDiario, UsoServico } from "./tipos";

// Monta os medidores da página "Uso dos serviços" a partir das medições (coletor/uso.py) e dos contadores do dia.
// Os limites são os dos planos grátis; os do Gemini mudam de tempos em tempos, por isso são aproximados.

export const LIMITES = {
  geminiFlashDia: 20, // aprox.: escrita de emails e follow-ups
  geminiLiteDia: 500, // aprox.: resumos e leitura de posts
  gmailDia: 500, // limite do Gmail para contas pessoais (envios em 24h)
  supabasePausaDias: 7, // o projeto grátis pausa depois de 7 dias sem uso
};

export type Estado = "ok" | "atencao" | "critico" | "sem";
export type Medidor = {
  id: string;
  nome: string;
  para: string;
  estado: Estado;
  /** 0 a 1 do limite grátis; null = sem limite ou sem medição. */
  fracao: number | null;
  /** Texto no centro quando não há porcentagem (ex.: "∞"). */
  centro?: string;
  texto: string; // "US$ 0,95 de US$ 5,00"
  periodo: string; // "mês (renova 02/11)"
  detalhes: string[];
  medidoEm: string | null;
  link: { href: string; rotulo: string };
};

const fmtHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const fmtDia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const mb = (b: number) => (b >= 1e9 ? `${(b / 2 ** 30).toFixed(2)} GB` : `${(b / 2 ** 20).toFixed(b < 10 * 2 ** 20 ? 2 : 1)} MB`).replace(".", ",");
const usd = (x: number) => `US$ ${x.toFixed(2).replace(".", ",")}`;
const pct = (f: number) => `${Math.round(f * 100)}%`;
const n = (x: number) => x.toLocaleString("pt-BR");

/** 60% = atenção; 80% = perto do limite (mesma linha do alerta por email). */
export function estadoDe(f: number | null): Estado {
  if (f === null) return "sem";
  return f >= 0.8 ? "critico" : f >= 0.6 ? "atencao" : "ok";
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

export function montarUso({ servicos, diario, ultimaColeta, emailsCandidaturaHoje, agora = new Date() }: Entrada): Medidor[] {
  const s = (id: string) => servicos.find((x) => x.servico === id);
  const conta = (diaAlvo: string, chave: string) => diario.filter((d) => d.dia === diaAlvo && d.chave === chave).reduce((a, d) => a + Number(d.n), 0);
  const contaPrefixo = (diaAlvo: string, prefixo: string) =>
    diario.filter((d) => d.dia === diaAlvo && d.chave.startsWith(prefixo)).reduce((a, d) => a + Number(d.n), 0);
  const m: Medidor[] = [];

  // Apify: crédito do ciclo mensal
  const ap = s("apify");
  if (ap) {
    const d = ap.dados as { usado_usd: number; limite_usd: number; ciclo_inicio: string | null; ciclo_fim: string | null };
    const f = d.limite_usd ? d.usado_usd / d.limite_usd : null;
    const detalhes: string[] = [];
    let periodo = "mês";
    if (d.ciclo_inicio && d.ciclo_fim) {
      const ini = Date.parse(d.ciclo_inicio), fim = Date.parse(d.ciclo_fim);
      const prev = (d.usado_usd / Math.max(1, (agora.getTime() - ini) / 864e5)) * ((fim - ini) / 864e5);
      periodo = `mês (renova ${fmtDia.format(new Date(fim + 1000))})`;
      detalhes.push(`No ritmo atual, fecha o ciclo em ${usd(prev)} (${pct(prev / d.limite_usd)}).`);
    }
    detalhes.push("Se acabar, só a busca do LinkedIn para até renovar.");
    m.push({
      id: "apify", nome: "Apify", para: "Posts do LinkedIn", estado: estadoDe(f), fracao: f,
      texto: `${usd(d.usado_usd)} de ${usd(d.limite_usd)}`, periodo, detalhes, medidoEm: ap.atualizado_em,
      link: { href: "https://console.apify.com/billing", rotulo: "Abrir no Apify" },
    });
  }

  // GitHub Actions: minutos no mês (repositório público: sem limite)
  const gh = s("github");
  if (gh) {
    const d = gh.dados as { privado: boolean; minutos: number; limite: number | null; execucoes: number; por_workflow: Record<string, number> };
    const diasMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0)).getUTCDate();
    const previsto = Math.round((d.minutos / Math.max(1, agora.getUTCDate())) * diasMes);
    const f = d.limite ? d.minutos / d.limite : null;
    const proximoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1, 12));
    m.push({
      id: "github", nome: "GitHub Actions", para: "Coletas e envio da fila",
      estado: d.limite ? estadoDe(Math.max(f!, previsto >= d.limite ? 0.6 : 0)) : "ok", fracao: f, centro: d.limite ? undefined : "∞",
      texto: d.limite ? `${n(d.minutos)} de ${n(d.limite)} min` : `${n(d.minutos)} min no mês`,
      periodo: `mês (zera ${fmtDia.format(proximoMes)})`,
      detalhes: [
        d.limite ? `No ritmo atual, fecha o mês com uns ${n(previsto)} min.` : "Repositório público: sem limite de minutos.",
        `${d.execucoes} execuções: ` + Object.entries(d.por_workflow ?? {}).sort((a, b) => b[1] - a[1]).map(([w, x]) => `${w} ${x} min`).join(", "),
      ],
      medidoEm: gh.atualizado_em,
      link: { href: "https://github.com/settings/billing", rotulo: "Abrir no GitHub" },
    });
  }

  // Gemini: pedidos do dia (a cota zera à meia-noite do Pacífico)
  const hojeP = dia("America/Los_Angeles", agora);
  for (const [id, nome, para, limite] of [
    ["flash", "Gemini Flash", "Escrever emails e follow-ups", LIMITES.geminiFlashDia],
    ["lite", "Gemini Flash-Lite", "Resumos e leitura de posts", LIMITES.geminiLiteDia],
  ] as const) {
    const usados = conta(hojeP, `gemini:${id}`);
    const esgotou = conta(hojeP, `gemini:${id}:limite`);
    const f = usados / limite;
    m.push({
      id: `gemini-${id}`, nome, para, estado: estadoDe(esgotou ? Math.max(f, 0.8) : f), fracao: esgotou ? Math.max(f, 1) : f,
      texto: `${n(usados)} de ~${n(limite)} pedidos hoje`, periodo: "dia (zera às 4h ou 5h)",
      detalhes: [esgotou ? `A cota acabou ${esgotou} vez(es) hoje: o site usou outro modelo ou o modelo pronto.` : "A cota não acabou hoje."],
      medidoEm: null,
      link: { href: "https://aistudio.google.com/usage", rotulo: "Abrir no AI Studio" },
    });
  }

  // Gmail: emails de candidatura contra o seu limite (e o total contra o limite do Gmail)
  const hojeBR = dia("America/Sao_Paulo", agora);
  const totalGmail = contaPrefixo(hojeBR, "gmail:");
  const lim = PERFIL.envio.limiteDiario;
  const fGmail = Math.max(emailsCandidaturaHoje / lim, totalGmail / LIMITES.gmailDia);
  m.push({
    id: "gmail", nome: "Gmail", para: "Emails de candidatura", estado: estadoDe(fGmail), fracao: emailsCandidaturaHoje / lim,
    texto: `${emailsCandidaturaHoje} de ${lim} emails hoje`, periodo: "dia (zera à meia-noite)",
    detalhes: [
      `${totalGmail} de ${LIMITES.gmailDia} no total do Gmail hoje: ${conta(hojeBR, "gmail:site")} pelo site, ${conta(hojeBR, "gmail:fila")} pela fila, ` +
        `${conta(hojeBR, "gmail:resumo")} resumo(s), ${conta(hojeBR, "gmail:alerta")} alerta(s).`,
    ],
    medidoEm: null,
    link: { href: "https://mail.google.com/mail/u/0/#sent", rotulo: "Abrir enviados" },
  });

  // Supabase: banco (o maior dos dois limites) e pausa por inatividade
  const sb = s("supabase");
  const horasSemColeta = ultimaColeta ? (agora.getTime() - Date.parse(ultimaColeta)) / 36e5 : null;
  if (sb) {
    const d = sb.dados as { banco_bytes: number; banco_limite: number; arquivos_bytes: number; arquivos_limite: number };
    const f = Math.max(d.banco_bytes / d.banco_limite, d.arquivos_bytes / d.arquivos_limite);
    const parado = horasSemColeta !== null && horasSemColeta > 5 * 24;
    m.push({
      id: "supabase", nome: "Supabase", para: "Banco e currículo", estado: estadoDe(parado ? Math.max(f, 0.8) : f), fracao: f,
      texto: `${mb(d.banco_bytes)} de ${mb(d.banco_limite)}`, periodo: "total",
      detalhes: [
        `Arquivos: ${mb(d.arquivos_bytes)} de ${mb(d.arquivos_limite)}.`,
        horasSemColeta === null
          ? "Pausa depois de 7 dias sem uso: as coletas evitam isso."
          : `Pausa com ${LIMITES.supabasePausaDias} dias sem uso; última coleta há ${horasSemColeta < 1 ? "menos de 1 h" : `${Math.round(horasSemColeta)} h`}${parado ? ": atenção!" : "."}`,
      ],
      medidoEm: sb.atualizado_em,
      link: { href: "https://supabase.com/dashboard/project/_/settings/billing/usage", rotulo: "Abrir no Supabase" },
    });
  }

  // Do mais apertado para o mais folgado (sem limite por último).
  m.sort((a, b) => (b.fracao ?? -1) - (a.fracao ?? -1));

  // Vercel: sem medição automática (a API de uso pede um token de conta)
  m.push({
    id: "vercel", nome: "Vercel", para: "O site", estado: "sem", fracao: null, centro: "—",
    texto: "Folga para 1 pessoa", periodo: "plano Hobby",
    detalhes: ["Medir pede um token da sua conta. Para uma pessoa, o plano grátis sobra."],
    medidoEm: null,
    link: { href: "https://vercel.com/dashboard/usage", rotulo: "Abrir na Vercel" },
  });
  return m;
}

export function quandoMedido(m: Medidor): string {
  if (m.estado === "sem") return "Não medido";
  return m.medidoEm ? `Medido em ${fmtHora.format(new Date(m.medidoEm))}` : "Contado a cada uso";
}

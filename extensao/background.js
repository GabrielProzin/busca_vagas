// Enviar para o busca_vagas
// Só age quando você clica. Dois jeitos:
// 1. Selecione o texto de uma vaga em qualquer site > botão direito > "Enviar para o busca_vagas".
// 2. No LinkedIn, clique no ícone da extensão (ou botão direito > "Capturar vagas com email desta página"):
//    lê os posts que JÁ ESTÃO na sua tela e manda só os que têm email e cara de vaga.
// Não rola a página, não clica, não abre nada e não faz nenhum acesso extra ao LinkedIn.

const MENU = "enviar-busca-vagas";
const MENU_LOTE = "capturar-lote-busca-vagas";
const LOTE = 8; // posts por chamada ao site

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU, title: "Enviar para o busca_vagas", contexts: ["selection"] });
    chrome.contextMenus.create({
      id: MENU_LOTE,
      title: "Capturar vagas com email desta página",
      contexts: ["page"],
      documentUrlPatterns: ["https://www.linkedin.com/*"],
    });
  });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.url && /^https:\/\/www\.linkedin\.com\//.test(tab.url)) capturarLote(tab);
  else chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU) enviarSelecao(info, tab);
  if (info.menuItemId === MENU_LOTE) capturarLote(tab);
});

async function config() {
  const { site, token } = await chrome.storage.local.get(["site", "token"]);
  if (!site || !token) {
    avisar("Configure a extensão", "Informe o endereço do site e o token nas opções.");
    chrome.runtime.openOptionsPage();
    return null;
  }
  return { site: site.replace(/\/+$/, ""), token };
}

// ------------------------------------------------------------------ 1. texto selecionado
async function enviarSelecao(info, tab) {
  const cfg = await config();
  if (!cfg) return;
  // Pega a seleção com as quebras de linha (info.selectionText vem achatado).
  let texto = info.selectionText || "";
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? "",
    });
    if (r?.result && r.result.length >= texto.length) texto = r.result;
  } catch (_) {
    // páginas especiais (chrome://, loja) não deixam ler; segue com a seleção simples
  }

  avisar("Lendo a vaga…", "A IA está avaliando contra o seu currículo.", "lendo");
  try {
    const resp = await fetch(`${cfg.site}/api/capturar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ texto, url: tab?.url ?? null }),
    });
    const r = await resp.json().catch(() => ({ ok: false, erro: `Resposta inválida (${resp.status})` }));
    chrome.notifications.clear("lendo");
    if (!r.ok) {
      avisar("Não foi adicionada", r.erro || `Erro ${resp.status}`);
      return;
    }
    const email = r.email ? `Email: ${r.email}` : "Sem email no texto";
    avisar(`Nota ${Math.round(r.nota)}: ${r.titulo}`, `${email}. Clique para abrir.`, `abrir|${cfg.site}/vaga/${encodeURIComponent(r.id)}`);
  } catch (e) {
    chrome.notifications.clear("lendo");
    avisar("Falha de conexão", `Não consegui falar com ${cfg.site}. ${e.message}`);
  }
}

// ------------------------------------------------------------------ 2. posts da tela (LinkedIn)

// Roda DENTRO da página do LinkedIn: só lê o que já está carregado na tela.
// Precisa ser autocontida (o Chrome serializa a função).
function lerPostsDaTela() {
  const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
  const VAGA = /\b(vagas?|contratando|contratamos|oportunidade|curr[ií]culo|\bcv\b|hiring|recrut|seleciona|buscamos|procuramos)/i;
  const CANDIDATO = /#opentowork|estou (em busca|procurando|à procura)|busco (uma )?(nova )?oportunidade|aberto a (novas )?oportunidades/i;
  const achados = new Map();
  const guardar = (id, el) => {
    if (id && el && !achados.has(id)) achados.set(id, el);
  };
  // Cada post do feed/busca carrega o identificador "urn:li:activity:<número>".
  document.querySelectorAll('[data-urn*="urn:li:activity:"], [data-id*="urn:li:activity:"]').forEach((el) => {
    const urn = el.getAttribute("data-urn") || el.getAttribute("data-id") || "";
    guardar((urn.match(/activity:(\d+)/) || [])[1], el);
  });
  // Reserva, se o LinkedIn mudar a estrutura: links do tipo /feed/update/urn:li:activity:<número>.
  document.querySelectorAll('a[href*="urn:li:activity:"]').forEach((a) => {
    const id = (a.getAttribute("href").match(/activity:(\d+)/) || [])[1];
    guardar(id, a.closest('[data-view-name], article, li, .feed-shared-update-v2') || a.parentElement);
  });
  const posts = [];
  for (const [id, el] of achados) {
    let texto = (el.innerText || "").trim();
    if (!EMAIL.test(texto) && EMAIL.test(el.textContent || "")) texto = (el.textContent || "").trim();
    if (texto.length < 80 || !EMAIL.test(texto) || !VAGA.test(texto) || CANDIDATO.test(texto)) continue;
    posts.push({ id, texto: texto.slice(0, 12000), url: `https://www.linkedin.com/feed/update/urn:li:activity:${id}/` });
  }
  return { total: achados.size, posts };
}

async function capturarLote(tab) {
  const cfg = await config();
  if (!cfg || !tab?.id) return;
  let leitura;
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: lerPostsDaTela });
    leitura = r?.result;
  } catch (e) {
    avisar("Não consegui ler a página", e.message);
    return;
  }
  if (!leitura || leitura.total === 0) {
    avisar("Nenhum post na tela", "Abra uma busca de posts (ou o feed), role um pouco para carregar e clique de novo.");
    return;
  }
  // Não manda de novo o que já foi enviado antes (economiza a IA).
  const { enviados = [] } = await chrome.storage.local.get("enviados");
  const ja = new Set(enviados);
  const novos = leitura.posts.filter((p) => !ja.has(p.id));
  if (!novos.length) {
    const motivo = leitura.posts.length ? "Os posts com email desta tela já foram enviados antes." : "Nenhum post com email e cara de vaga.";
    avisar(`${leitura.total} posts na tela`, `${motivo} Role para carregar mais e clique de novo.`);
    return;
  }

  avisar(`Lendo ${novos.length} posts com email…`, "A IA está separando cargo, empresa e nota. Leva uns segundos.", "lendo");
  const total = { novas: [], recusadas: {}, limite: false, erroRede: null };
  for (let i = 0; i < novos.length && !total.limite; i += LOTE) {
    const parte = novos.slice(i, i + LOTE);
    try {
      const resp = await fetch(`${cfg.site}/api/capturar/lote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ posts: parte }),
      });
      const r = await resp.json().catch(() => ({ ok: false, erro: `Resposta inválida (${resp.status})` }));
      if (!r.ok) {
        total.erroRede = r.erro || `Erro ${resp.status}`;
        break;
      }
      total.novas.push(...r.novas);
      for (const [k, n] of Object.entries(r.recusadas || {})) total.recusadas[k] = (total.recusadas[k] || 0) + n;
      total.limite = r.limite;
      // Lembra o que o site já processou. Se a IA bateu no limite, este pedaço fica para a próxima vez
      // (os que já entraram no site voltam como "repetida", sem gastar IA).
      if (!r.limite) parte.forEach((p) => ja.add(p.id));
    } catch (e) {
      total.erroRede = e.message;
      break;
    }
  }
  await chrome.storage.local.set({ enviados: [...ja].slice(-3000) });
  chrome.notifications.clear("lendo");

  const r = total.recusadas;
  const partes = [
    r.repetida && `${r.repetida} já estavam no site`,
    r.fora_do_perfil && `${r.fora_do_perfil} fora do seu perfil`,
    r.nao_vaga && `${r.nao_vaga} não eram vaga`,
    r.sem_email && `${r.sem_email} sem email`,
    r.erro && `${r.erro} com erro`,
  ].filter(Boolean);
  let titulo = total.novas.length ? `${total.novas.length} vaga(s) nova(s) com email` : "Nenhuma vaga nova";
  let msg = partes.length ? partes.join(", ") + "." : "";
  if (total.limite) msg += " A IA atingiu o limite do dia; o resto fica para amanhã.";
  if (total.erroRede) {
    titulo = "Parou no meio";
    msg = `${total.erroRede}. ${msg}`;
  }
  const destino = total.novas.length === 1 ? `${cfg.site}/vaga/${encodeURIComponent(total.novas[0].id)}` : `${cfg.site}/vagas?email=1`;
  avisar(titulo, (msg || "Clique para abrir.").trim(), total.novas.length ? `abrir|${destino}` : undefined);
}

// ------------------------------------------------------------------ avisos
chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith("abrir|")) chrome.tabs.create({ url: id.slice(6) });
  chrome.notifications.clear(id);
});

function avisar(titulo, mensagem, id) {
  const opcoes = { type: "basic", iconUrl: "icones/128.png", title: titulo, message: mensagem, priority: 1 };
  if (id) chrome.notifications.create(id, opcoes);
  else chrome.notifications.create(opcoes);
}

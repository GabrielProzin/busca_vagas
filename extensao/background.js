// Enviar para o busca_vagas
// Só age quando você clica: pega o texto que VOCÊ selecionou e manda para o seu site.
// Não lê páginas sozinha, não navega e não clica em nada no LinkedIn ou em outro site.

const MENU = "enviar-busca-vagas";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU, title: "Enviar para o busca_vagas", contexts: ["selection"] });
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU) return;
  const { site, token } = await chrome.storage.local.get(["site", "token"]);
  if (!site || !token) {
    avisar("Configure a extensão", "Informe o endereço do site e o token nas opções.");
    chrome.runtime.openOptionsPage();
    return;
  }

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
    const resp = await fetch(`${site.replace(/\/+$/, "")}/api/capturar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ texto, url: tab?.url ?? null }),
    });
    const r = await resp.json().catch(() => ({ ok: false, erro: `Resposta inválida (${resp.status})` }));
    chrome.notifications.clear("lendo");
    if (!r.ok) {
      avisar("Não foi adicionada", r.erro || `Erro ${resp.status}`);
      return;
    }
    const email = r.email ? `Email: ${r.email}` : "Sem email no texto";
    const id = `vaga|${site.replace(/\/+$/, "")}/vaga/${encodeURIComponent(r.id)}`;
    avisar(`Nota ${Math.round(r.nota)}: ${r.titulo}`, `${email}. Clique para abrir.`, id);
  } catch (e) {
    chrome.notifications.clear("lendo");
    avisar("Falha de conexão", `Não consegui falar com ${site}. ${e.message}`);
  }
});

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith("vaga|")) chrome.tabs.create({ url: id.slice(5) });
  chrome.notifications.clear(id);
});

function avisar(titulo, mensagem, id) {
  const opcoes = { type: "basic", iconUrl: "icones/128.png", title: titulo, message: mensagem, priority: 1 };
  if (id) chrome.notifications.create(id, opcoes);
  else chrome.notifications.create(opcoes);
}

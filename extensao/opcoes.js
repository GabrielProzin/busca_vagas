const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["site", "token"]).then(({ site, token }) => {
  if (site) $("site").value = site;
  if (token) $("token").value = token;
});

$("salvar").addEventListener("click", async () => {
  const msg = $("msg");
  let origem;
  try {
    origem = new URL($("site").value.trim()).origin;
  } catch {
    msg.textContent = "Endereço inválido. Use o link completo, começando com https://";
    return;
  }
  const token = $("token").value.trim();
  if (token.length < 24) {
    msg.textContent = "Token muito curto. Use o mesmo valor de CAPTURA_TOKEN (24+ caracteres).";
    return;
  }
  // Pede permissão só para o SEU site, não para a web inteira.
  const ok = await chrome.permissions.request({ origins: [`${origem}/*`] });
  if (!ok) {
    msg.textContent = "Sem a permissão a extensão não consegue enviar para o site.";
    return;
  }
  await chrome.storage.local.set({ site: origem, token });
  msg.textContent = "Salvo. Agora selecione o texto de uma vaga e use o botão direito.";
});

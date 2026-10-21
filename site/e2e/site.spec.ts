import { expect, test, type Page } from "@playwright/test";

// Os fluxos que não podem quebrar. Rodam em ordem (o modo demo guarda o estado em memória).
// Dados fictícios: e2e/demo.json. Gmail simulado (nada é enviado). Gemini falso: e2e/gemini_falso.py.

const TOKEN = "token-de-teste-com-mais-de-24-caracteres";
const CRON = "segredo-do-cron-de-teste";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function entrar(page: Page) {
  await page.goto("/login");
  await page.fill("#senha", "senha-de-teste");
  await page.click("button[type=submit]");
  await page.waitForURL("/");
}

test.describe.configure({ mode: "serial" });

test("login: senha errada não entra; certa entra", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#senha", "errada");
  await page.click("button[type=submit]");
  await expect(page.getByText("Senha incorreta.")).toBeVisible();
  await entrar(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^(Bom dia|Boa tarde|Boa noite), /);
});

test("sem login: páginas e dados ficam fechados", async ({ request }) => {
  for (const rota of ["/", "/vagas", "/triagem", "/lote", "/uso", "/candidaturas", "/painel", "/vaga/gupy%3A1", "/api/exportar"]) {
    const r = await request.get(rota, { maxRedirects: 0 });
    expect(r.status(), rota).toBeGreaterThanOrEqual(300);
    expect(r.status(), rota).toBeLessThan(400);
    expect(r.headers()["location"] ?? "", rota).toContain("/login");
  }
});

test("Hoje: mostra vagas com email, triagem, follow-ups e andamento", async ({ page }) => {
  await entrar(page);
  for (const bloco of ["Vagas novas com email", "Triagem", "Follow-ups", "Em andamento"]) {
    await expect(page.getByRole("region", { name: bloco })).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Vagas novas com email" })).toContainText("Fictícia Log");
  await expect(page.getByRole("region", { name: "Follow-ups" })).toContainText("16d");
  // menu: selo laranja com os follow-ups pendentes
  await expect(page.locator(".lateral-nav .contador.quente")).toHaveText(/^1/);
});

test("lista: filtro Com email mostra só vagas com email", async ({ page }) => {
  await entrar(page);
  await page.goto("/vagas");
  const total = await page.locator(".tv-item").count();
  expect(total).toBeGreaterThan(2);
  await page.locator(".chips").getByRole("link", { name: /Com email/ }).click();
  await page.waitForURL(/vagas\?.*email=1/);
  const itens = page.locator(".tv-item");
  expect(await itens.count()).toBeGreaterThan(0);
  expect(await itens.count()).toBeLessThan(total);
  for (const item of await itens.all()) await expect(item.locator(".etiqueta.email")).toBeVisible();
});

test("lista: descartar mostra Desfazer, e desfazer devolve a vaga", async ({ page }) => {
  await entrar(page);
  await page.goto("/vagas");
  const antes = await page.locator(".tv-item").count();
  const titulo = (await page.locator(".tv-item .tv-titulo").first().innerText()).trim();
  await page.locator(".tv-item").first().getByRole("button", { name: /Descartar/ }).click();
  const aviso = page.locator(".aviso-flutuante", { hasText: "Descartada" });
  await expect(aviso).toBeVisible();
  await expect(page.locator(".tv-item")).toHaveCount(antes - 1);
  await aviso.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.locator(".tv-item")).toHaveCount(antes);
  await expect(page.locator(".tv-item .tv-titulo", { hasText: titulo }).first()).toBeVisible();
});

test("triagem: D descarta e Z desfaz", async ({ page }) => {
  await entrar(page);
  await page.goto("/triagem");
  await expect(page.locator(".triagem-cartao")).toBeVisible();
  await expect(page.locator(".triagem-progresso")).toContainText("0 decididas");
  await page.keyboard.press("d");
  await expect(page.locator(".triagem-progresso")).toContainText("1 decididas");
  await expect(page.locator(".triagem-progresso")).toContainText("Vaga 2 de");
  await page.keyboard.press("z");
  await expect(page.locator(".triagem-progresso")).toContainText("0 decididas");
  await expect(page.locator(".triagem-progresso")).toContainText("Vaga 1 de");
  // o desfazer chegou ao banco: a vaga continua na lista
  await page.waitForTimeout(500);
  await page.goto("/triagem");
  await expect(page.locator(".triagem-progresso")).toContainText("0 decididas");
});

test("vaga com email abre com o email já preenchido", async ({ page }) => {
  await entrar(page);
  await page.goto("/vaga/linkedin%3A8");
  await expect(page.locator("textarea[name=corpo]")).toHaveValue(/Analista de Dados Júnior/);
  await expect(page.locator("input[name=assunto]")).toHaveValue(/^Candidatura: /);
  await expect(page.getByText("Já preenchido com o modelo pronto")).toBeVisible();
  await expect(page.getByRole("button", { name: "Melhorar com IA" })).toBeVisible();
});

test("configurações: primeiros passos mostram o que falta", async ({ page }) => {
  await entrar(page);
  await page.goto("/configuracoes");
  const passos = page.locator(".passos");
  await expect(passos).toContainText("Currículo em PDF anexado");
  await expect(passos.locator("li.falta.essencial", { hasText: "Currículo em PDF" })).toBeVisible();
  await expect(passos.locator("li.pronto", { hasText: "Banco de dados conectado" })).toBeVisible();
});

test("email: envia com currículo anexado e não sai duas vezes (duas abas)", async ({ page, context }) => {
  await entrar(page);
  await page.goto("/configuracoes");
  await page.setInputFiles("input[name=pdf]", { name: "cv.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("button", { name: "Salvar currículo" }).click();
  await expect(page.getByText(/Currículo salvo/)).toBeVisible();

  const abas = [page, await context.newPage()];
  for (const aba of abas) {
    await aba.goto("/vaga/linkedin%3A2");
    await aba.getByRole("button", { name: "Usar modelo pronto" }).first().click();
    await expect(aba.locator("textarea[name=corpo]")).not.toHaveValue("");
    await expect(aba.getByRole("textbox", { name: "Para" })).toHaveValue("vagas@ficticia-log.exemplo.com");
    await aba.check("input[name=revisado]");
  }
  await Promise.all(abas.map((aba) => aba.getByRole("button", { name: "Enviar pelo Gmail" }).click()));
  const resultados = await Promise.all(
    abas.map((aba) => aba.locator(".aviso.ok, .erro").first().innerText({ timeout: 15000 })),
  );
  expect(resultados.filter((t) => t.includes("Email enviado")).length).toBe(1);
  // A outra aba é recusada: pela trava no banco ("já foi enviado") ou, se chegou depois, pela checagem inicial.
  expect(resultados.filter((t) => /já foi enviado|já enviou/.test(t)).length, resultados.join(" | ")).toBe(1);
});

test("envio em lote: email pronto, entra na fila, sai das novas e volta ao tirar da fila", async ({ page }) => {
  await entrar(page);
  await page.goto("/lote");
  const lista = page.getByRole("region", { name: "Vagas para enviar" });
  await expect(lista).toContainText("talentos@correio.exemplo.com");
  await expect(page.getByRole("region", { name: "Envio de hoje" })).toContainText("/40");
  const linha = lista.locator("li", { hasText: "Correio Exemplo" });
  await linha.getByRole("button", { name: "Ver email" }).click();
  await expect(linha.locator("textarea")).toHaveValue(/Analista de Dados Júnior/);
  await expect(linha.locator("input[type=text]")).toHaveValue(/^Candidatura: /);

  await page.getByRole("button", { name: "Desmarcar todas" }).click();
  await linha.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Colocar 1 na fila" }).click();
  await expect(page.locator(".aviso-flutuante", { hasText: "1 email entrou na fila" })).toBeVisible();
  await expect(lista.locator("li", { hasText: "Correio Exemplo" })).toHaveCount(0);
  const fila = page.getByRole("region", { name: "Fila de envio" });
  await expect(fila).toContainText("Analista de Dados Júnior");
  await expect(fila).toContainText("talentos@correio.exemplo.com");

  // na fila = não é mais "nova": sai da lista de vagas e aparece na tela da vaga e em Hoje
  await page.goto("/vagas?email=1");
  await expect(page.locator(".tv-item", { hasText: "Correio Exemplo" })).toHaveCount(0);
  await page.goto("/vaga/linkedin%3A8");
  await expect(page.getByText(/Na fila de envio desde/)).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Envio de emails" })).toContainText("na fila");

  await page.goto("/lote");
  await page.getByRole("region", { name: "Fila de envio" }).getByRole("button", { name: "Tirar da fila" }).click();
  await expect(page.locator(".aviso-flutuante", { hasText: "Saiu da fila" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Fila de envio" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Vagas para enviar" })).toContainText("Correio Exemplo");
});

test("respostas e devoluções lidas do Gmail aparecem em Hoje, na vaga e no Painel", async ({ page }) => {
  await entrar(page);
  const envio = page.getByRole("region", { name: "Envio de emails" });
  await expect(envio).toContainText("Respondeu");
  await expect(envio).toContainText("Email voltou");
  await expect(envio).toContainText(/\d+\/40/);
  await page.goto("/vaga/linkedin%3A11");
  await expect(page.getByText(/O email voltou em/)).toBeVisible();
  await page.goto("/vaga/linkedin%3A10");
  await expect(page.getByText(/Resposta recebida em/)).toBeVisible();
  // devolvido não pede follow-up, mesmo enviado
  await page.goto("/candidaturas");
  await expect(page.locator(".kanban-cartao", { hasText: "Devolvida Exemplo" }).locator(".kanban-followup")).toHaveCount(0);
  await page.goto("/painel");
  const taxa = page.getByRole("region", { name: "Taxa de resposta" });
  await expect(taxa).toContainText("geral");
  await expect(taxa).toContainText("por email");
  await expect(taxa).toContainText("pelo link");
  await expect(taxa).toContainText("1 email devolvido fica fora da conta");
});

test("kanban: arrastar o cartão salva a nova etapa", async ({ page }) => {
  await entrar(page);
  await page.goto("/candidaturas");
  const cartao = page.locator(".kanban-cartao", { hasText: "Fictícia Log" });
  await expect(cartao).toBeVisible();
  await cartao.dragTo(page.locator('.kanban-coluna[aria-label="Respondeu"]'));
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('.kanban-coluna[aria-label="Respondeu"] .kanban-cartao', { hasText: "Fictícia Log" })).toBeVisible();
});

test("follow-up: pendente aparece no quadro e é enviado como resposta", async ({ page }) => {
  await entrar(page);
  await page.goto("/candidaturas");
  const aviso = page.locator(".kanban-followup.fu-followup", { hasText: "16 dias" });
  await expect(aviso).toBeVisible();
  await aviso.click();
  const cartao = page.locator(".cartao-followup");
  await expect(cartao).toBeVisible();
  await cartao.getByRole("button", { name: "Escrever follow-up com IA" }).click();
  await expect(cartao.locator("input[name=assunto]")).toHaveValue(/^Re: Candidatura/);
  await cartao.locator("input[name=revisado]").check();
  await cartao.getByRole("button", { name: "Enviar follow-up" }).click();
  await expect(cartao.getByText(/Follow-up enviado/)).toBeVisible();
  await page.reload();
  await expect(page.locator(".cartao-followup")).toContainText("Último follow-up");
});

test("extensão: captura em lote exige token e não repete post", async ({ request }) => {
  const posts = {
    posts: [{ id: "7390000000000000099", texto: "VAGA | Analista de Dados Júnior | Remoto. Requisitos: SQL e Power BI. Envie o currículo para vagas@contrata.exemplo.com", url: "https://www.linkedin.com/feed/update/urn:li:activity:7390000000000000099/" }],
  };
  expect((await request.post("/api/capturar/lote", { data: posts })).status()).toBe(401);
  const cab = { Authorization: `Bearer ${TOKEN}` };
  const r1 = await (await request.post("/api/capturar/lote", { data: posts, headers: cab })).json();
  expect(r1.novas).toHaveLength(1);
  const r2 = await (await request.post("/api/capturar/lote", { data: posts, headers: cab })).json();
  expect(r2.novas).toHaveLength(0);
  expect(r2.recusadas.repetida).toBe(1);
});

test("saúde e vigia: público só o mínimo; vigia exige o segredo do cron", async ({ request }) => {
  const saude = await request.get("/api/saude");
  expect(saude.status()).toBe(200);
  expect(Object.keys(await saude.json()).sort()).toEqual(["banco", "ok", "ultima_coleta_horas"]);
  expect((await request.get("/api/vigia")).status()).toBe(401);
  const vigia = await request.get("/api/vigia", { headers: { Authorization: `Bearer ${CRON}` } });
  expect(vigia.status()).toBe(200);
  expect((await vigia.json()).acao).toBe("nada a fazer"); // a coleta do demo é "agora"
});

test("exportar meus dados baixa as candidaturas", async ({ page }) => {
  await entrar(page);
  const r = await page.request.get("/api/exportar");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-disposition"]).toContain("attachment");
  const dados = await r.json();
  expect(dados.candidaturas.length).toBeGreaterThanOrEqual(3);
  expect(dados.vagas.length).toBe(dados.candidaturas.length);
});

test("vaga inexistente mostra página amigável", async ({ page }) => {
  await entrar(page);
  await page.goto("/vaga/nao-existe");
  await expect(page.getByText("Página não encontrada.")).toBeVisible();
});

test("uso dos serviços: mostra cada plano grátis e conta Gmail e IA usados pelo site", async ({ page }) => {
  await entrar(page);
  await expect(page.locator("a.faixa", { hasText: "Apify em 85%" })).toBeVisible(); // aviso em Hoje: passou de 80%
  await page.goto("/uso");
  // medidores do mais apertado para o mais folgado (o Flash ficou sem cota no teste); Vercel por último
  await expect(page.locator(".medidor h2").first()).toHaveText("Gemini Flash");
  await expect(page.locator(".medidor h2").nth(1)).toHaveText("Apify");
  await expect(page.locator(".medidor h2").last()).toHaveText("Vercel");
  const apify = page.getByRole("region", { name: "Apify" });
  await expect(apify).toContainText("85%");
  await expect(apify).toContainText("US$ 4,27 de US$ 5,00");
  await expect(apify).toContainText("Perto do limite");
  await expect(page.getByRole("region", { name: "GitHub Actions" })).toContainText("1.240 de 2.000 min");
  await expect(page.getByRole("region", { name: "Supabase" })).toContainText("MB de 500,0 MB");
  // os testes anteriores enviaram 1 candidatura e 1 follow-up pelo site, e pediram o follow-up à IA
  await expect(page.getByRole("region", { name: "Gmail" })).toContainText("2 pelo site, 0 pela fila, 1 resumo(s)");
  // o Gemini falso responde "sem cota" no Flash: o site conta a falta de cota e o pedido que caiu no Flash-Lite
  await expect(page.getByRole("region", { name: "Gemini Flash", exact: true })).toContainText(/A cota acabou [1-9]\d* vez/);
  await expect(page.getByRole("region", { name: "Gemini Flash-Lite" })).toContainText(/[1-9]\d* de ~500 pedidos hoje/);
  await expect(page.getByRole("region", { name: "Vercel" })).toContainText("Sem medição");
});

test("celular: nenhuma página principal rola para o lado", async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await contexto.newPage();
  await entrar(page);
  for (const rota of ["/", "/vagas", "/triagem", "/lote", "/uso", "/candidaturas", "/painel", "/configuracoes", "/adicionar", "/vaga/gupy%3A1"]) {
    await page.goto(rota);
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largura, rota).toBeLessThanOrEqual(390);
  }
  await contexto.close();
});

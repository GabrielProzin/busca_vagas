import { expect, test, type Page } from "@playwright/test";

// Assistente de instalação numa cópia "recém-criada pelo botão da Vercel": sem SESSION_SECRET, Gemini, Gmail nem
// token do GitHub (servidor próprio, porta 3124; ver playwright.config.ts). GitHub falso (e2e/github_falso.py, que
// guarda o que recebeu em /_estado) e Gemini falso.

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const CHAVE = "AIzaSyExemploDeChaveFalsa0123456789abc";
const SENHA_APP = "abcd efgh ijkl mnop";
const TOKEN_GH = "github_pat_" + "x".repeat(40);
const GITHUB = "http://127.0.0.1:3998";

test.describe.configure({ mode: "serial" });

async function entrar(page: Page) {
  await page.goto("/login");
  await page.fill("#senha", "senha-de-teste");
  await page.click("button[type=submit]");
  await page.waitForURL("/");
}

function passo(page: Page, titulo: string) {
  return page.locator(".inst-passo", { has: page.locator(".inst-titulo b", { hasText: titulo }) });
}

test("login funciona sem SESSION_SECRET e Hoje leva para a instalação", async ({ page }) => {
  await entrar(page);
  await page.getByRole("link", { name: /Terminar a instalação/ }).click();
  await expect(page).toHaveURL(/\/instalar$/);
  await expect(passo(page, "Banco de dados")).toHaveClass(/pronto/);
  await expect(passo(page, "IA do Google")).toHaveClass(/vez/);
  // Perfil e coleta esperam os passos de que dependem.
  await expect(passo(page, "Seu perfil")).toContainText("Faça antes os passos 2 (Gemini) e 4 (GitHub)");
});

test("Gemini e Gmail: testa antes de salvar e não mostra a chave de volta", async ({ page }) => {
  await entrar(page);
  await page.goto("/instalar");
  const gemini = passo(page, "IA do Google");
  await gemini.getByLabel(/Chave do Gemini/).fill("AIzaSyEssaChaveEhinvalida0123456789invalida");
  await gemini.getByRole("button", { name: "Testar e salvar" }).click();
  await expect(gemini.getByRole("alert")).toContainText("O Google não aceitou essa chave");
  await gemini.getByLabel(/Chave do Gemini/).fill(CHAVE);
  await gemini.getByRole("button", { name: "Testar e salvar" }).click();
  await expect(gemini.getByRole("status")).toContainText("Chave testada e salva");
  await expect(gemini).toHaveClass(/pronto/);

  const gmail = passo(page, "Gmail");
  await expect(gmail).toHaveClass(/vez/);
  await gmail.getByLabel("Seu Gmail").fill("ana@exemplo.com");
  await gmail.getByLabel(/Senha de app/).fill("curta");
  await gmail.getByRole("button", { name: "Testar e salvar" }).click();
  await expect(gmail.getByRole("alert")).toContainText("16 letras");
  await expect(gmail.getByLabel("Seu Gmail")).toHaveValue("ana@exemplo.com"); // o erro não apaga o que foi digitado
  await gmail.getByLabel(/Senha de app/).fill(SENHA_APP);
  await gmail.getByRole("button", { name: "Testar e salvar" }).click();
  await expect(gmail.getByRole("status")).toContainText("Gmail testado e salvo");

  await page.reload();
  const html = await page.content();
  expect(html).not.toContain(CHAVE);
  expect(html).not.toContain("abcdefghijklmnop");
});

test("GitHub: confere o token, liga tudo e mostra a senha do backup uma vez", async ({ page }) => {
  await entrar(page);
  await page.goto("/instalar");
  const gh = passo(page, "GitHub");
  const criar = gh.getByRole("link", { name: /Criar o token no GitHub/ });
  const href = (await criar.getAttribute("href")) ?? "";
  expect(href).toContain("github.com/settings/personal-access-tokens/new");
  for (const p of ["actions=write", "secrets=write", "contents=write", "workflows=write", "pull_requests=write", "target_name=exemplo"]) expect(href).toContain(p);

  await gh.getByLabel(/Token do GitHub/).fill("github_pat_" + "y".repeat(40)); // formato certo, mas o GitHub recusa
  await gh.getByRole("button", { name: "Conferir e ligar" }).click();
  await expect(gh.getByRole("alert")).toContainText("O GitHub não aceitou esse token");
  await gh.getByLabel(/Token do GitHub/).fill("senha-qualquer");
  await gh.getByRole("button", { name: "Conferir e ligar" }).click();
  await expect(gh.getByRole("alert")).toContainText("github_pat_");
  await gh.getByLabel(/Token do GitHub/).fill(TOKEN_GH);
  await gh.getByRole("button", { name: "Conferir e ligar" }).click();
  await expect(gh.getByRole("status")).toContainText("GitHub ligado");
  await expect(gh.locator(".inst-guardar code")).toHaveText(/^[\w-]{20,}$/);
  await expect(gh).toHaveClass(/pronto/);

  const estado = await (await page.request.get(`${GITHUB}/_estado`)).json();
  for (const nome of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "RESUMO_PARA", "BACKUP_SENHA", "PERFILUP_TOKEN"]) {
    expect(estado.secrets, nome).toContain(nome);
  }
  expect(estado.ligados).toEqual(["coleta.yml", "envio.yml", "atualizar.yml"]);

  // O token da extensão foi criado junto e aparece em Configurações.
  await page.goto("/configuracoes");
  await page.getByText("Mostrar o token da extensão").click();
  await expect(page.locator(".inst-token code")).toHaveText(/^[\w-]{24,}$/);
});

test("perfil: a IA lê o PDF, tira contato do texto e a pessoa revisa antes de salvar", async ({ page }) => {
  await entrar(page);
  await page.goto("/instalar");
  const perfil = passo(page, "Seu perfil");
  await expect(perfil).toHaveClass(/vez/);
  await perfil.locator("input[type=file]").setInputFiles({ name: "curriculo.pdf", mimeType: "application/pdf", buffer: PDF });
  await perfil.getByRole("button", { name: "Ler o currículo" }).click();
  await expect(perfil.getByText("Li o seu currículo")).toBeVisible();
  await expect(perfil.getByLabel("Nome completo")).toHaveValue("Ana Exemplo da Silva");
  await expect(perfil.getByLabel("LinkedIn")).toHaveValue("https://linkedin.com/in/ana-exemplo");

  await perfil.getByText("Texto do currículo").click();
  const texto = await perfil.getByLabel("Texto do currículo").inputValue();
  expect(texto).toContain("## Experiência");
  expect(texto).not.toContain("ana@exemplo.com");
  expect(texto).not.toContain("99999");

  await perfil.locator(".inst-habs label", { hasText: "tableau" }).click(); // desmarca
  await perfil.getByLabel(/Faltou alguma/).fill("Spark");
  await perfil.getByRole("button", { name: "Salvar o meu perfil" }).click();
  await expect(perfil.getByRole("status")).toContainText("Perfil salvo no seu repositório");
  await expect(perfil).toHaveClass(/pronto/);
  await expect(passo(page, "Preferências da busca")).toHaveClass(/vez/);

  // O que foi para o repositório: o perfil revisado, sem contato no texto do currículo.
  const estado = await (await page.request.get(`${GITHUB}/_estado`)).json();
  const yaml: string = estado.arquivos["perfil/perfil.yaml"];
  expect(yaml).toContain("nome: Ana Exemplo da Silva");
  expect(yaml).toContain("# Perfil do candidato (modelo).");  // mantém os comentários do arquivo
  expect(yaml).toMatch(/power_bi: \{ peso: 3, padroes: \[ 'power \?bi' \] \}/);
  expect(yaml).toContain("spark:");
  expect(yaml).not.toContain("tableau");
  expect(estado.arquivos["perfil/curriculo.md"]).not.toMatch(/ana@exemplo\.com|99999/);
  expect(estado.ultima_mensagem).toBe("Perfil de Ana Exemplo (assistente de instalação)");
});

test("configurações: avisa da versão nova e o botão dispara a atualização", async ({ page }) => {
  await entrar(page);
  await page.goto("/configuracoes");
  await expect(page.getByRole("heading", { name: "Atualizações" })).toBeVisible();
  await expect(page.getByText(/Versão nova de .*Tela nova de exemplo/)).toBeVisible();
  await page.getByRole("button", { name: "Atualizar agora" }).click();
  await expect(page.getByText("Atualização iniciada")).toBeVisible();
  const estado = await (await page.request.get(`${GITHUB}/_estado`)).json();
  expect(estado.disparos.map((d: { arquivo: string }) => d.arquivo)).toContain("atualizar.yml");
  await expect(page.locator(".passos li.pronto", { hasText: "Gmail para enviar" })).toBeVisible();
  await expect(page.locator(".passos li.pronto", { hasText: "Perfil e currículo são seus" })).toBeVisible();
});

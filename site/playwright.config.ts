import { defineConfig, devices } from "@playwright/test";

// Testes de ponta a ponta do site, em modo demonstração (dados fictícios de e2e/demo.json),
// com Gemini falso e Gmail simulado. Rodam no GitHub a cada mudança no site.
// Local: npm run build && npm run test:e2e

const PORTA = 3123;
const PORTA_INSTALAR = 3124; // cópia "recém-criada pelo botão da Vercel": sem Gemini, Gmail nem GitHub
export const TOKEN_TESTE = "token-de-teste-com-mais-de-24-caracteres";
export const CRON_TESTE = "segredo-do-cron-de-teste";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1, // o modo demo guarda o estado em memória: um teste por vez
  retries: 0, // o estado do modo demo continua entre tentativas: repetir não é um teste limpo
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORTA}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: "computador", testIgnore: /instalar\.spec/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      name: "instalacao",
      testMatch: /instalar\.spec/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, baseURL: `http://localhost:${PORTA_INSTALAR}` },
    },
  ],
  webServer: [
    { command: "python3 e2e/gemini_falso.py", port: 3999, reuseExistingServer: !process.env.CI },
    { command: "python3 e2e/github_falso.py", port: 3998, reuseExistingServer: !process.env.CI },
    {
      command: `npx next start -p ${PORTA}`,
      port: PORTA,
      reuseExistingServer: !process.env.CI,
      env: {
        SITE_PASSWORD: "senha-de-teste",
        SESSION_SECRET: "segredo-de-sessao-de-teste-com-mais-de-32-caracteres",
        DEMO_ARQUIVO: "e2e/demo.json",
        GEMINI_API_KEY: "falsa",
        GEMINI_BASE_URL: "http://127.0.0.1:3999",
        GMAIL_USER: "gabriel@exemplo.com",
        GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
        CAPTURA_TOKEN: TOKEN_TESTE,
        CRON_SECRET: CRON_TESTE,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
    {
      command: `npx next start -p ${PORTA_INSTALAR}`,
      port: PORTA_INSTALAR,
      reuseExistingServer: !process.env.CI,
      env: {
        SITE_PASSWORD: "senha-de-teste",
        // Sem SESSION_SECRET: a sessão e a cifra dos segredos saem da chave do Supabase, como na instalação pelo botão.
        SUPABASE_URL: "https://exemplo.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_chave-ficticia-so-para-os-testes",
        DEMO_ARQUIVO: "e2e/demo.json",
        GEMINI_BASE_URL: "http://127.0.0.1:3999",
        GITHUB_API_URL: "http://127.0.0.1:3998",
        VERCEL_GIT_REPO_OWNER: "exemplo",
        VERCEL_GIT_REPO_SLUG: "perfilup",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});

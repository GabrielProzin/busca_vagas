# busca_vagas

Radar pessoal de vagas júnior de dados: coleta vagas todos os dias, filtra o que não faz sentido,
ranqueia cada vaga contra o meu currículo com uma nota explicável e (nas próximas fases) gera e
envia emails de candidatura personalizados a partir de um site privado.

> Projeto em construção. Fase 1 (coleta + ranking) pronta; site, emails e quadro de candidaturas a seguir.

## Como funciona

```
GitHub Actions (todo dia, 07:17)
  └─ coletor/pipeline.py
       1. Coleta     Gupy (rota do portal) + Remotar (API do site) + issues de repositórios de vagas no GitHub
                     e deduplica entre fontes (links da Gupy carregam o jobId em base64)
       2. Filtra     título (trilha de dados, senioridade, bloqueios) e data — antes de baixar descrições
       3. Detalha    baixa a descrição completa só das candidatas
       4. Filtra     local (remoto BR ou Goiânia e região), idioma, anos de experiência
                     e senioridade escrita na descrição
       5. Ranqueia   nota 0–100 com motivos
       6. Grava      Supabase (Postgres) + JSON
```

### A nota de compatibilidade

| Componente | Peso | Como é calculado |
|---|---|---|
| Semântica | 45% | Cada frase da vaga é comparada com cada frase do currículo via embeddings multilíngues (`paraphrase-multilingual-MiniLM-L12-v2`, ONNX via fastembed, roda no CPU do Actions). Média das 8 frases da vaga mais bem atendidas. |
| Habilidades | 40% | Habilidades do currículo encontradas na vaga (com peso e sinônimos) contra requisitos pesados ausentes (Spark, Databricks, AWS…). Requisito marcado como "diferencial" não penaliza. |
| Trilha | 15% | Analista de Dados/BI > Engenharia de Dados > Ciência de Dados > genérico. |
| Júnior | +5 | Título indica júnior. |

Cada vaga sai com os motivos ("Pede Python, SQL, Power BI — está no seu currículo", o trecho da vaga
mais parecido com uma linha do currículo, o que falta) e cai em uma de duas listas: **principal** ou
**vale tentar** (quando exige algo central que não está no currículo).

## Estrutura

```
config/preferencias.yaml   termos de busca, trilhas, bloqueios, local, nota mínima
perfil/perfil.yaml         habilidades (pesos e sinônimos) e destaques para os emails
perfil/curriculo.md        currículo em texto, base da comparação semântica
coletor/                   fontes, filtros, ranking, armazenamento e pipeline
supabase/schema.sql        tabelas vagas, candidaturas, execucoes (RLS ligado)
tests/                     testes dos filtros e do ranking
```

## Quando uma fonte muda

Sites de vagas mudam de API sem aviso (a Gupy trocou de rota em 2026). `scripts/sondar_fontes.py`
testa os endpoints conhecidos e varre os bundles JavaScript dos sites atrás de rotas de API.
Ele roda no workflow com a opção **diagnóstico**, que também publica o log da coleta no branch `diagnostico`.

## Rodando localmente

```bash
pip install -r requirements.txt
python -m pytest -q
python -m coletor.pipeline            # --tfidf para rodar sem baixar o modelo de embeddings
```

Variáveis opcionais: `GITHUB_TOKEN` (fonte GitHub), `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (gravação no banco).

## Stack

Python · fastembed (ONNX) · scikit-learn · GitHub Actions · Supabase (Postgres) · Next.js + Vercel (fase 2)

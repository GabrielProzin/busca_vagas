#!/usr/bin/env bash
# Traz as melhorias do PerfilUp original para esta cópia, sem apagar as mudanças da pessoa (docs/spec.md, "Atualizações").
#
# Funciona como um merge: pega só o que mudou na origem desde a versão desta cópia (arquivo .versao, ou a data em
# que a cópia foi criada) e aplica por cima, em 3 vias. A pasta perfil/ (perfil e currículo de cada um) fica de fora.
#   - aplicou limpo   -> commit no próprio ramo (a Vercel publica sozinha)
#   - bateu com uma mudança da pessoa no mesmo trecho -> nada muda no ramo; vai tudo para o ramo
#     "perfilup-atualizacao", com as marcas de conflito, para revisar num Pull Request
#
# Uso: scripts/atualizar.sh <git da origem> [data de criação desta cópia, ISO]
# Escreve em $GITHUB_OUTPUT (ou na tela): resultado=nada|aplicada|conflito, versao=<sha curto>, conflitos=<arquivos>
set -euo pipefail

ORIGEM="$1"
CRIADA_EM="${2:-}"
SAIDA="${GITHUB_OUTPUT:-/dev/stdout}"
RAMO_REVISAO="perfilup-atualizacao"

git fetch --quiet --no-tags "$ORIGEM" "+main:refs/remotes/origem/main"
NOVA=$(git rev-parse refs/remotes/origem/main)

# A origem (ou uma cópia que já tem tudo) não tem o que atualizar.
if git merge-base --is-ancestor "$NOVA" HEAD 2>/dev/null; then
  echo "resultado=nada" >> "$SAIDA"
  exit 0
fi

BASE=""
if [ -f .versao ]; then BASE=$(cut -d' ' -f1 .versao); fi
if [ -z "$BASE" ] || ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  # Cópia ainda sem .versao: vale a última versão da origem antes de a cópia ser criada.
  BASE=""
  if [ -n "$CRIADA_EM" ]; then BASE=$(git rev-list -1 --before="$CRIADA_EM" refs/remotes/origem/main || true); fi
fi
if [ -z "$BASE" ]; then
  echo "::error::Não achei de qual versão do PerfilUp esta cópia veio. Veja \"Atualizações\" no README."
  exit 1
fi
if [ "$BASE" = "$NOVA" ]; then
  echo "resultado=nada" >> "$SAIDA"
  exit 0
fi

CURTA=$(git rev-parse --short "$NOVA")
DATA=$(TZ=UTC git log -1 --date=format-local:%Y-%m-%dT%H:%M:%SZ --format=%cd "$NOVA")
PATCH=$(mktemp)
git diff --binary --full-index "$BASE" "$NOVA" -- . ':(exclude)perfil' ':(exclude).versao' > "$PATCH"

git config user.name "PerfilUp"
git config user.email "perfilup@users.noreply.github.com"

ERROS=$(mktemp)
if [ ! -s "$PATCH" ] || git apply --3way --whitespace=nowarn "$PATCH" 2> "$ERROS"; then
  echo "$NOVA $DATA" > .versao
  git add -A
  git commit --quiet -m "Atualiza o PerfilUp para a versão $CURTA" -m "Origem: $ORIGEM"
  git push --quiet origin "HEAD:${RAMO_DESTINO:-$(git rev-parse --abbrev-ref HEAD)}"
  { echo "resultado=aplicada"; echo "versao=$CURTA"; } >> "$SAIDA"
  exit 0
fi

# Conflito: o ramo principal fica como está; a atualização vai para revisão.
CONFLITOS=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
if [ -z "$CONFLITOS" ]; then
  # Nem o merge em 3 vias conseguiu (ex.: arquivo apagado nesta cópia). Nada foi aplicado: a revisão leva a lista.
  CONFLITOS=$(sed -nE 's/^error: (patch failed: )?([^:]+):.*/\2/p' "$ERROS" | sort -u | tr '\n' ' ')
  git diff --binary "$BASE" "$NOVA" -- . ':(exclude)perfil' ':(exclude).versao' > perfilup-atualizacao.patch
fi
echo "$NOVA $DATA" > .versao
git add -A  # marca os arquivos com conflito como "resolvidos" (com as marcas <<<<<<<) para poder trocar de ramo
git checkout --quiet -B "$RAMO_REVISAO"
git commit --quiet -m "Atualização do PerfilUp ($CURTA) com conflitos para revisar" -m "Arquivos: $CONFLITOS"
git push --quiet --force origin "$RAMO_REVISAO"
{ echo "resultado=conflito"; echo "versao=$CURTA"; echo "conflitos=$CONFLITOS"; } >> "$SAIDA"

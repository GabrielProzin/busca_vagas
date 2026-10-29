"""Atualização das cópias (scripts/atualizar.sh): traz as melhorias da origem sem apagar as mudanças de quem copiou.
Ver docs/spec.md, "Atualizações". Usa repositórios git de mentira numa pasta temporária."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "atualizar.sh"

pytestmark = pytest.mark.skipif(shutil.which("git") is None or shutil.which("bash") is None, reason="precisa de git e bash")

AMBIENTE = {
    **os.environ,
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_AUTHOR_NAME": "Teste",
    "GIT_AUTHOR_EMAIL": "teste@exemplo.com",
    "GIT_COMMITTER_NAME": "Teste",
    "GIT_COMMITTER_EMAIL": "teste@exemplo.com",
}


def git(pasta, *args, data=None):
    amb = dict(AMBIENTE)
    if data:
        amb["GIT_AUTHOR_DATE"] = amb["GIT_COMMITTER_DATE"] = data
    return subprocess.run(["git", *args], cwd=pasta, env=amb, check=True, capture_output=True, text=True).stdout.strip()


def escrever(pasta, arquivos):
    for nome, texto in arquivos.items():
        p = pasta / nome
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(texto, encoding="utf-8")


def atualizar(copia, origem, criada_em="2026-10-21T00:00:00Z"):
    saida = copia.parent / "saida.txt"
    saida.write_text("")
    subprocess.run(["bash", str(SCRIPT), str(origem), criada_em], cwd=copia, env={**AMBIENTE, "GITHUB_OUTPUT": str(saida)},
                   check=True, capture_output=True, text=True)
    return dict(l.split("=", 1) for l in saida.read_text().splitlines() if "=" in l)


APP = "a\nb\nc\nd\ne\nf\ng\n"


@pytest.fixture
def cenario(tmp_path):
    """Origem com uma versão em 20/10; cópia criada em 21/10 do jeito da Vercel (sem histórico); origem evolui em 25/10."""
    origem, copia, remota = tmp_path / "origem", tmp_path / "copia", tmp_path / "copia.git"
    origem.mkdir()
    git(origem, "init", "-q", "-b", "main")
    escrever(origem, {"perfil/perfil.yaml": "nome: Dono\n", "site/app.ts": APP, ".github/workflows/coleta.yml": "v1\n"})
    git(origem, "add", "-A")
    git(origem, "commit", "-qm", "v1", data="2026-10-20T10:00:00Z")

    shutil.copytree(origem, copia, ignore=shutil.ignore_patterns(".git"))
    git(copia, "init", "-q", "-b", "main")
    git(copia, "add", "-A")
    git(copia, "commit", "-qm", "Initial commit", data="2026-10-21T00:00:00Z")
    git(tmp_path, "init", "-q", "--bare", str(remota))
    git(copia, "remote", "add", "origin", str(remota))
    git(copia, "push", "-q", "origin", "main")

    escrever(origem, {"site/app.ts": APP.replace("b\n", "B da origem\n"), "site/novo.ts": "novo\n",
                      ".github/workflows/coleta.yml": "v2\n", "perfil/perfil.yaml": "nome: Dono mudou\n"})
    git(origem, "add", "-A")
    git(origem, "commit", "-qm", "v2", data="2026-10-25T10:00:00Z")
    return origem, copia, remota


def test_atualiza_mantendo_mudancas_da_pessoa(cenario):
    origem, copia, remota = cenario
    escrever(copia, {"site/app.ts": APP.replace("f\n", "f do amigo\n"), "perfil/perfil.yaml": "nome: Amigo\n", "site/meu.ts": "meu\n"})
    git(copia, "add", "-A")
    git(copia, "commit", "-qm", "minhas mudanças")

    r = atualizar(copia, origem)
    assert r["resultado"] == "aplicada"
    app = (copia / "site/app.ts").read_text()
    assert "B da origem" in app and "f do amigo" in app  # as duas mudanças ficam
    assert (copia / "perfil/perfil.yaml").read_text() == "nome: Amigo\n"  # perfil nunca é tocado
    assert (copia / "site/novo.ts").exists() and (copia / "site/meu.ts").exists()
    assert (copia / ".github/workflows/coleta.yml").read_text() == "v2\n"
    sha, data = (copia / ".versao").read_text().split()
    assert sha == git(origem, "rev-parse", "HEAD") and data == "2026-10-25T10:00:00Z"
    assert git(remota, "rev-parse", "main") == git(copia, "rev-parse", "HEAD")  # foi para o ramo principal

    # Segunda atualização: parte do .versao, não da data de criação.
    escrever(origem, {"site/novo.ts": "novo 2\n"})
    git(origem, "commit", "-qam", "v3", data="2026-10-27T10:00:00Z")
    assert atualizar(copia, origem, criada_em="")["resultado"] == "aplicada"
    assert (copia / "site/novo.ts").read_text() == "novo 2\n"
    assert atualizar(copia, origem)["resultado"] == "nada"


def test_conflito_vai_para_revisao_sem_mexer_no_ramo_principal(cenario):
    origem, copia, remota = cenario
    escrever(copia, {"site/app.ts": APP.replace("b\n", "b do amigo\n")})
    git(copia, "commit", "-qam", "mudei a mesma linha")
    git(copia, "push", "-q", "origin", "main")
    antes = git(remota, "rev-parse", "main")

    r = atualizar(copia, origem)
    assert r["resultado"] == "conflito" and "site/app.ts" in r["conflitos"]
    assert git(remota, "rev-parse", "main") == antes  # o site no ar não muda
    revisao = git(remota, "show", "perfilup-atualizacao:site/app.ts")
    assert "<<<<<<<" in revisao and "B da origem" in revisao and "b do amigo" in revisao
    assert git(remota, "show", "perfilup-atualizacao:site/novo.ts") == "novo"  # o que não conflitou vai junto


def test_a_propria_origem_nao_se_atualiza(cenario):
    origem, _, _ = cenario
    assert atualizar(origem, origem)["resultado"] == "nada"


def test_arquivo_apagado_na_copia_tambem_vai_para_revisao(cenario):
    origem, copia, remota = cenario
    git(copia, "rm", "-q", "site/app.ts")
    git(copia, "commit", "-qm", "apaguei")
    git(copia, "push", "-q", "origin", "main")
    antes = git(remota, "rev-parse", "main")

    r = atualizar(copia, origem)
    assert r["resultado"] == "conflito" and "site/app.ts" in r["conflitos"]
    assert git(remota, "rev-parse", "main") == antes

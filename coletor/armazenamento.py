"""Grava o resultado no Supabase (se configurado) e sempre em JSON local."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import requests

from .modelos import Vaga

log = logging.getLogger(__name__)

_COLUNAS_VAGA = ["id", "fonte", "titulo", "empresa", "url", "descricao", "cidade", "estado", "modalidade",
                 "publicada_em", "email_contato", "emails", "trilha", "nivel", "nota", "lista", "motivos",
                 "habilidades_ok", "habilidades_faltando", "componentes", "termo_busca", "email_origem"]


def salvar_json(vagas: list[Vaga], execucao: dict, pasta: str = "saida") -> Path:
    Path(pasta).mkdir(exist_ok=True)
    caminho = Path(pasta) / f"vagas_{datetime.now(timezone.utc):%Y-%m-%d}.json"
    caminho.write_text(json.dumps({"execucao": execucao, "vagas": [v.para_dict() for v in vagas]},
                                  ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    return caminho


class Supabase:
    def __init__(self, url: str, chave: str):
        # Aceita tanto "https://x.supabase.co" quanto "https://x.supabase.co/rest/v1/".
        raiz = url.strip().rstrip("/")
        if raiz.endswith("/rest/v1"):
            raiz = raiz[: -len("/rest/v1")]
        self.base = raiz + "/rest/v1"
        self.h = {"apikey": chave, "Content-Type": "application/json"}
        # Chaves antigas (JWT "service_role") também vão no Authorization; as novas (sb_secret_...) só no apikey.
        if not chave.startswith("sb_"):
            self.h["Authorization"] = f"Bearer {chave}"

    @classmethod
    def do_ambiente(cls) -> "Supabase | None":
        url, chave = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        return cls(url, chave) if url and chave else None

    def ids_existentes(self, ids: list[str]) -> set[str]:
        """Quais destas vagas já estavam no banco (para saber o que é novidade nesta coleta)."""
        existentes: set[str] = set()
        for i in range(0, len(ids), 100):
            lote = ",".join('"' + x.replace('"', '') + '"' for x in ids[i:i + 100])
            r = requests.get(f"{self.base}/vagas", headers=self.h, params={"select": "id", "id": f"in.({lote})"}, timeout=30)
            r.raise_for_status()
            existentes |= {linha["id"] for linha in r.json()}
        return existentes

    def upsert_vagas(self, vagas: list[Vaga]) -> None:
        agora = datetime.now(timezone.utc).isoformat()
        linhas = []
        for v in vagas:
            d = v.para_dict()
            linha = {k: d[k] for k in _COLUNAS_VAGA}
            linha["atualizada_em"] = agora
            linhas.append(linha)
        # "primeira_vez_em" fica de fora do payload, então o upsert preserva o valor original.
        for i in range(0, len(linhas), 200):
            lote = linhas[i:i + 200]
            r = requests.post(f"{self.base}/vagas", headers={**self.h, "Prefer": "resolution=merge-duplicates"},
                              params={"on_conflict": "id"}, data=json.dumps(lote, default=str), timeout=60)
            if r.status_code == 400 and "email_origem" in r.text:
                # Banco sem a coluna nova (falta rodar o ALTER do schema.sql): grava o resto mesmo assim.
                log.warning("supabase: coluna email_origem ausente; rode o ALTER do supabase/schema.sql")
                lote = [{k: v for k, v in x.items() if k != "email_origem"} for x in lote]
                r = requests.post(f"{self.base}/vagas", headers={**self.h, "Prefer": "resolution=merge-duplicates"},
                                  params={"on_conflict": "id"}, data=json.dumps(lote, default=str), timeout=60)
            r.raise_for_status()
        log.info("supabase: %d vagas gravadas", len(linhas))

    def execucoes_recentes(self, limite: int = 6) -> list[dict]:
        r = requests.get(f"{self.base}/execucoes", headers=self.h,
                         params={"select": "coletadas,iniciada_em", "order": "iniciada_em.desc", "limit": limite}, timeout=30)
        r.raise_for_status()
        return r.json()

    def registrar_execucao(self, execucao: dict) -> None:
        r = requests.post(f"{self.base}/execucoes", headers=self.h, data=json.dumps(execucao, default=str), timeout=30)
        novas = [c for c in ("aprendizado", "tipo") if c in execucao]
        if r.status_code == 400 and any(c in r.text for c in novas):
            log.warning("supabase: faltam colunas em execucoes (%s); rode o SQL do supabase/schema.sql", ", ".join(novas))
            sem = {k: v for k, v in execucao.items() if k not in novas}
            r = requests.post(f"{self.base}/execucoes", headers=self.h, data=json.dumps(sem, default=str), timeout=30)
        r.raise_for_status()

    def ultima_completa(self) -> str | None:
        """Quando começou a última coleta completa (a que manda o resumo). None se não há registro."""
        r = requests.get(f"{self.base}/execucoes", headers=self.h, timeout=30, params={
            "select": "iniciada_em", "tipo": "eq.completa", "order": "iniciada_em.desc", "limit": 1})
        if not r.ok:
            return None
        linhas = r.json()
        return linhas[0]["iniciada_em"] if linhas else None

    def sinais_de_uso(self, limite: int = 400) -> list[dict]:
        """O que você fez com as vagas (aplicou, descartou...), com título e descrição, para o ranking aprender."""
        r = requests.get(f"{self.base}/candidaturas", headers=self.h, timeout=60, params={
            "select": "status,atualizada_em,vaga:vagas(id,titulo,descricao)",
            "status": "in.(aplicada,enviada,respondeu,entrevista,proposta,recusada,descartada)",
            "order": "atualizada_em.desc", "limit": limite})
        r.raise_for_status()
        return r.json()

    def candidaturas_abertas(self) -> list[dict]:
        """Candidaturas ainda sem resposta (para o lembrete de follow-up no resumo)."""
        r = requests.get(f"{self.base}/candidaturas", headers=self.h, timeout=30, params={
            "select": "*,vaga:vagas(id,titulo,empresa,url)", "status": "in.(aplicada,enviada)"})
        r.raise_for_status()
        return r.json()

    # ------------------------------------------------------------------ fila de envio e respostas
    def _patch(self, filtro: dict, campos: dict) -> list[dict]:
        r = requests.patch(f"{self.base}/candidaturas", headers={**self.h, "Prefer": "return=representation"},
                           params=filtro, data=json.dumps(campos, default=str), timeout=30)
        r.raise_for_status()
        return r.json()

    def fila(self, limite: int) -> list[dict]:
        """Candidaturas esperando envio, da mais antiga para a mais nova."""
        r = requests.get(f"{self.base}/candidaturas", headers=self.h, timeout=30, params={
            "select": "*,vaga:vagas(id,titulo,empresa)", "fila_em": "not.is.null", "status": "eq.nova",
            "order": "fila_em.asc", "limit": limite})
        r.raise_for_status()
        return r.json()

    def enviados_desde(self, desde_iso: str) -> list[str]:
        """Endereços que receberam email de candidatura desde um momento (um por email enviado)."""
        r = requests.get(f"{self.base}/candidaturas", headers=self.h, timeout=30, params={
            "select": "email_para", "enviada_em": f"gte.{desde_iso}", "email_para": "not.is.null",
            "status": "not.in.(nova,aplicada,descartada)"})
        r.raise_for_status()
        return [(x.get("email_para") or "").lower() for x in r.json()]

    def reservar_envio(self, vaga_id: str) -> bool:
        """Marca como enviada numa atualização condicional: se outra rodada já pegou, devolve False."""
        agora = datetime.now(timezone.utc).isoformat()
        linhas = self._patch({"vaga_id": f"eq.{vaga_id}", "status": "eq.nova", "fila_em": "not.is.null"},
                             {"status": "enviada", "enviada_em": agora, "atualizada_em": agora})
        return len(linhas) == 1

    def atualizar_candidatura(self, vaga_id: str, campos: dict, filtro_extra: dict | None = None) -> list[dict]:
        campos = {**campos, "atualizada_em": datetime.now(timezone.utc).isoformat()}
        return self._patch({"vaga_id": f"eq.{vaga_id}", **(filtro_extra or {})}, campos)

    def enfileirar(self, linhas: list[dict]) -> int:
        """Cria candidaturas já na fila; nunca sobrescreve uma candidatura que já existe (decisão sua vale mais)."""
        if not linhas:
            return 0
        r = requests.post(f"{self.base}/candidaturas", headers={**self.h, "Prefer": "resolution=ignore-duplicates,return=representation"},
                          params={"on_conflict": "vaga_id"}, data=json.dumps(linhas, default=str), timeout=30)
        r.raise_for_status()
        return len(r.json())

    def candidaturas_com_email(self) -> list[dict]:
        """Candidaturas que mandaram email (para achar respostas e devoluções no Gmail)."""
        r = requests.get(f"{self.base}/candidaturas", headers=self.h, timeout=30, params={
            "select": "vaga_id,status,email_para,email_message_id,enviada_em,resposta_em,devolvido_em",
            "email_para": "not.is.null", "enviada_em": "not.is.null"})
        r.raise_for_status()
        return r.json()

    def baixar_curriculo(self) -> bytes | None:
        raiz = self.base[: -len("/rest/v1")]
        r = requests.get(f"{raiz}/storage/v1/object/privado/curriculo.pdf", headers=self.h, timeout=60)
        return r.content if r.ok else None

    def vagas_novas_desde(self, desde_iso: str, nota_minima: float) -> list[dict]:
        """Vagas que chegaram desde um momento, com nota mínima (para o resumo da coleta completa)."""
        r = requests.get(f"{self.base}/vagas", headers=self.h, timeout=30, params={
            "select": "id,fonte,titulo,empresa,url,cidade,modalidade,nota,lista,habilidades_ok,email_contato,"
                      "candidatura:candidaturas(status,fila_em)",
            "primeira_vez_em": f"gte.{desde_iso}", "nota": f"gte.{nota_minima}", "order": "nota.desc", "limit": 50})
        r.raise_for_status()
        return r.json()

    # ------------------------------------------------------------------ uso dos serviços
    def rpc(self, funcao: str, args: dict | None = None):
        r = requests.post(f"{self.base}/rpc/{funcao}", headers=self.h, data=json.dumps(args or {}, default=str), timeout=30)
        r.raise_for_status()
        return r.json() if r.text else None

    def somar_uso(self, chave: str, n: int = 1, dia: str | None = None) -> None:
        """Contador do dia (ex.: emails enviados). Nunca derruba quem chamou: o monitor é um extra."""
        from zoneinfo import ZoneInfo
        try:
            dia = dia or datetime.now(ZoneInfo("America/Sao_Paulo")).date().isoformat()
            self.rpc("somar_uso", {"p_dia": dia, "p_chave": chave, "p_n": n})
        except Exception as e:
            log.info("uso: contador %s não somado (%s)", chave, type(e).__name__)

    def ler_uso(self, servico: str) -> dict | None:
        r = requests.get(f"{self.base}/uso_servicos", headers=self.h, timeout=30,
                         params={"select": "dados,atualizado_em", "servico": f"eq.{servico}"})
        r.raise_for_status()
        linhas = r.json()
        return linhas[0]["dados"] if linhas else None

    def registrar_uso(self, servico: str, dados: dict) -> None:
        r = requests.post(f"{self.base}/uso_servicos", headers={**self.h, "Prefer": "resolution=merge-duplicates"},
                          params={"on_conflict": "servico"}, timeout=30, data=json.dumps(
                              {"servico": servico, "dados": dados, "atualizado_em": datetime.now(timezone.utc).isoformat()}, default=str))
        r.raise_for_status()

    def tamanho_arquivos(self) -> int:
        """Bytes guardados no Storage (o PDF do currículo)."""
        raiz = self.base[: -len("/rest/v1")]
        r = requests.post(f"{raiz}/storage/v1/object/list/privado", headers=self.h, timeout=30,
                          data=json.dumps({"prefix": "", "limit": 1000}))
        r.raise_for_status()
        return sum(int((o.get("metadata") or {}).get("size") or 0) for o in r.json())

    # ------------------------------------------------------------------ análises (mapa das vagas, o que estudar)
    def vagas_recentes(self, dias: int = 14) -> list[dict]:
        from datetime import timedelta
        desde = (datetime.now(timezone.utc) - timedelta(days=dias)).isoformat()
        r = requests.get(f"{self.base}/vagas", headers=self.h, timeout=60, params={
            "select": "id,titulo,empresa,url,descricao,nota,lista,trilha", "atualizada_em": f"gte.{desde}", "limit": 1000})
        r.raise_for_status()
        return r.json()

    def ler_analise(self, nome: str) -> dict | None:
        r = requests.get(f"{self.base}/analises", headers=self.h, timeout=30, params={"select": "dados", "nome": f"eq.{nome}"})
        r.raise_for_status()
        linhas = r.json()
        return linhas[0]["dados"] if linhas else None

    def salvar_analise(self, nome: str, dados: dict) -> None:
        r = requests.post(f"{self.base}/analises", headers={**self.h, "Prefer": "resolution=merge-duplicates"},
                          params={"on_conflict": "nome"}, timeout=60, data=json.dumps(
                              {"nome": nome, "dados": dados, "atualizado_em": datetime.now(timezone.utc).isoformat()}, default=str))
        r.raise_for_status()

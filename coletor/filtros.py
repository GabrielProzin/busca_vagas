"""Filtros baratos (regex) que rodam antes do ranking.

Cada filtro devolve o motivo do descarte (str) ou None se a vaga passou.
O motivo fica salvo, para dar para auditar por que uma vaga sumiu.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from .modelos import Vaga
from .texto import APELIDOS_CIDADE, compilar, normalizar, separar_cidade, texto_para_cidades

_ANOS = [
    re.compile(r"(\d{1,2})\s*(?:\+|ou mais)?\s*anos? de experiencia"),
    re.compile(r"experiencia (?:minima |previa |comprovada )?de (?:pelo menos |no minimo )?(\d{1,2})\s*anos?"),
    re.compile(r"(\d{1,2})\+?\s*years? of experience"),
]
_SENIOR_DESC = re.compile(r"\b(senior|pleno|sr\.?|mid[- ]level|especialista|experiencia solida|vasta experiencia)\b")
_JUNIOR_DESC = re.compile(r"\b(junior|jr\.?|inicio de carreira|primeiro emprego|entry[- ]level|recem[- ]formad)")
_PALAVRA = re.compile(r"[a-z]+")
# Sigla de estado colada num local: "Perus – SP", "São Paulo/SP", "(RJ)", "em MG". Só em maiúsculas, no texto original.
_UFS = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO"
_UF_NO_TEXTO = re.compile(rf"(?:[-–—/(,|]|\bem)\s*({_UFS})\b")
# Cidades grandes (sem acento, minúsculas) -> estado. Para posts que dizem a cidade sem a sigla.
_CIDADES_UF = {
    "sao paulo": "sp", "campinas": "sp", "barueri": "sp", "osasco": "sp", "santo andre": "sp", "sao bernardo": "sp",
    "guarulhos": "sp", "sorocaba": "sp", "ribeirao preto": "sp", "sao jose dos campos": "sp", "jundiai": "sp",
    "rio de janeiro": "rj", "niteroi": "rj", "belo horizonte": "mg", "uberlandia": "mg", "contagem": "mg",
    "curitiba": "pr", "londrina": "pr", "maringa": "pr", "porto alegre": "rs", "caxias do sul": "rs",
    "florianopolis": "sc", "joinville": "sc", "blumenau": "sc", "salvador": "ba", "recife": "pe", "fortaleza": "ce",
    "brasilia": "df", "manaus": "am", "belem": "pa", "vitoria": "es", "natal": "rn", "joao pessoa": "pb",
    "maceio": "al", "teresina": "pi", "sao luis": "ma", "cuiaba": "mt", "campo grande": "ms", "palmas": "to",
    "uberaba": "mg", "anapolis": "go",
}
_CLT = re.compile(r"\bclt\b|carteira assinada|regime efetivo")
_PJ = re.compile(r"\bpj\b|pessoa juridica|contrato de prestacao de servicos")
_PRESENCIAL = re.compile(r"\bpresencia(l|is)\b|\bon[- ]?site\b")
_EN = {"the", "and", "you", "with", "will", "our", "your", "are", "for", "this", "team", "we", "of", "to", "is",
       "experience", "skills", "work", "working", "data", "requirements", "about"}
_PT = {"de", "que", "para", "com", "voce", "uma", "dos", "das", "nos", "experiencia", "conhecimento", "dados",
       "em", "e", "o", "atuar", "sobre", "nossa", "requisitos"}


@dataclass
class Filtros:
    trilhas: list[tuple[str, float, re.Pattern]]
    senioridade_bloqueada: re.Pattern
    senioridade_alvo: re.Pattern
    bloqueio_titulo: re.Pattern
    empresas_bloqueadas: list[str]
    aceita_remoto: bool
    cidades: list[str]
    estado: str
    max_anos: int
    max_dias: int
    aceita_ingles: bool = False
    min_mencoes_senioridade: int = 2
    local_livre_fontes: tuple[str, ...] = ()
    aceita_hibrido: bool = True
    aceita_presencial: bool = True
    estados: frozenset[str] = frozenset()  # estados das cidades aceitas (+ "estado" do YAML)
    aceita_clt: bool = True
    aceita_pj: bool = True

    @classmethod
    def de_config(cls, cfg: dict) -> "Filtros":
        loc = cfg.get("localizacao", {})
        return cls(
            trilhas=[(t["nome"], float(t["peso"]), compilar(t["padroes"])) for t in cfg["trilhas"]],
            senioridade_bloqueada=compilar(cfg.get("senioridade_bloqueada", [])),
            senioridade_alvo=compilar(cfg.get("senioridade_alvo", [])),
            bloqueio_titulo=compilar(cfg.get("bloqueio_titulo", [])),
            empresas_bloqueadas=[normalizar(e) for e in cfg.get("empresas_bloqueadas", [])],
            aceita_remoto=loc.get("aceita_remoto", True),
            cidades=[c for c in (separar_cidade(x)[0] for x in loc.get("cidades_presencial_hibrido", [])) if c],
            estado=normalizar(loc.get("estado", "")),
            estados=frozenset(
                {uf for uf in (separar_cidade(x)[1] for x in loc.get("cidades_presencial_hibrido", [])) if uf}
                | ({normalizar(loc["estado"])} if loc.get("estado") else set())
            ),
            aceita_clt=bool((cfg.get("contrato") or {}).get("clt", True)),
            aceita_pj=bool((cfg.get("contrato") or {}).get("pj", True)),
            max_anos=int(cfg.get("max_anos_experiencia", 2)),
            max_dias=int(cfg.get("max_dias_publicacao", 14)),
            aceita_ingles=bool(loc.get("aceita_vagas_em_ingles", False)),
            min_mencoes_senioridade=int(cfg.get("min_mencoes_senioridade_descricao", 2)),
            local_livre_fontes=tuple(loc.get("local_nao_informado_aceito_em", [])),
            aceita_hibrido=bool(loc.get("aceita_hibrido", True)),
            aceita_presencial=bool(loc.get("aceita_presencial", True)),
        )

    # --- filtros de título (rodam antes de baixar a descrição completa) ---

    def filtrar_titulo(self, v: Vaga) -> str | None:
        t = normalizar(v.titulo)
        if m := self.senioridade_bloqueada.search(t):
            return f"senioridade: '{m.group(0).strip()}' no título"
        if m := self.bloqueio_titulo.search(t):
            return f"bloqueio: '{m.group(0).strip()}' no título"
        for nome, _, padrao in self.trilhas:
            if padrao.search(t):
                v.trilha = nome
                break
        else:
            return "título fora das trilhas de dados"
        v.nivel = "junior" if self.senioridade_alvo.search(t) else "nao_informado"
        emp = normalizar(v.empresa)
        dominios = [e.split("@")[-1] for e in v.emails]
        for b in self.empresas_bloqueadas:
            if b and (b in emp or any(b in d for d in dominios)):
                return f"empresa bloqueada: {b}"
        return None

    def filtrar_data(self, v: Vaga) -> str | None:
        if v.publicada_em is None:
            return None
        limite = datetime.now(timezone.utc) - timedelta(days=self.max_dias)
        pub = v.publicada_em if v.publicada_em.tzinfo else v.publicada_em.replace(tzinfo=timezone.utc)
        return f"publicada há mais de {self.max_dias} dias" if pub < limite else None

    def filtrar_local(self, v: Vaga) -> str | None:
        texto = normalizar(f"{v.titulo} {v.descricao[:2000]}")
        modalidade = v.modalidade
        if modalidade is None:
            if re.search(r"\b(100% )?remot[oa]\b|home ?office|trabalho remoto", texto):
                modalidade = "remoto"
            elif re.search(r"\bhibrid", texto):
                modalidade = "hibrido"
            elif _PRESENCIAL.search(texto):
                modalidade = "presencial"
        v.modalidade = modalidade
        if modalidade == "remoto":
            return None if self.aceita_remoto else "remoto não aceito"
        if modalidade == "hibrido" and not self.aceita_hibrido:
            return "híbrido não aceito"
        if modalidade == "presencial" and not self.aceita_presencial:
            return "presencial não aceito"
        # A cidade vem escrita de muitos jeitos ("Goiânia - GO", "goiania", "Gyn"): compara pelo nome-chave.
        cidade, uf = separar_cidade(v.cidade)
        if cidade:
            mesmo_estado = not (uf and self.estados) or uf in self.estados  # Santa Luzia (MG) não é Santa Luzia (PB)
            return None if cidade in self.cidades and mesmo_estado else f"{modalidade or 'presencial'} em {v.cidade}"
        # Sem cidade estruturada: procura uma das cidades aceitas (ou o apelido dela) no texto, como palavra inteira.
        if self.cidade_no_texto(f"{v.titulo} {v.descricao[:2000]}"):
            return None
        # O texto cita outro estado ou uma cidade grande de outro estado ("Perus – SP", "São Paulo"): é fora da região.
        fora = self.local_de_fora(f"{v.titulo} {v.descricao[:2000]}", texto)
        if fora:
            return f"{modalidade or 'presencial'} em {fora.upper()}"
        if not modalidade and v.fonte in self.local_livre_fontes:
            return None  # o pipeline avisa na vaga que o post não diz o local
        return "local não informado e não é remoto" if modalidade else "local não informado"

    def cidade_no_texto(self, original: str) -> bool:
        t = texto_para_cidades(original)
        nomes = set(self.cidades) | {ap for ap, nome in APELIDOS_CIDADE.items() if nome in self.cidades}
        return any(re.search(rf"\b{re.escape(c)}\b", t) for c in nomes)

    def _da_regiao(self, uf: str) -> bool:
        return uf in self.estados if self.estados else uf == self.estado

    def local_de_fora(self, original: str, texto: str) -> str | None:
        """Sigla do estado de fora da sua região citada no texto (ou None)."""
        for uf in _UF_NO_TEXTO.findall(original):
            if not self._da_regiao(uf.lower()):
                return uf.lower()
        for nome, uf in _CIDADES_UF.items():
            if not self._da_regiao(uf) and re.search(rf"\b{nome}\b", texto):
                return uf
        return None

    # --- filtros de descrição (rodam depois de baixar a descrição) ---

    def filtrar_idioma(self, v: Vaga) -> str | None:
        if self.aceita_ingles:
            return None
        palavras = _PALAVRA.findall(normalizar(f"{v.titulo} {v.descricao[:3000]}"))
        en = sum(p in _EN for p in palavras)
        pt = sum(p in _PT for p in palavras)
        return "vaga em inglês" if en > 15 and en > 1.5 * pt else None

    def filtrar_senioridade_descricao(self, v: Vaga) -> str | None:
        if v.nivel == "junior":
            return None
        texto = normalizar(v.descricao)
        senior = len(_SENIOR_DESC.findall(texto))
        junior = len(_JUNIOR_DESC.findall(texto))
        if junior == 0 and senior >= self.min_mencoes_senioridade:
            return "descrição indica pleno/sênior"
        if junior > 0 and senior == 0:
            v.nivel = "junior"
        return None

    def filtrar_contrato(self, v: Vaga) -> str | None:
        """Só descarta quando a vaga fala de um tipo de contrato não aceito e não oferece o outro."""
        if self.aceita_clt and self.aceita_pj:
            return None
        texto = normalizar(f"{v.titulo} {v.descricao[:4000]}")
        clt, pj = bool(_CLT.search(texto)), bool(_PJ.search(texto))
        if pj and not clt and not self.aceita_pj:
            return "contrato PJ"
        if clt and not pj and not self.aceita_clt:
            return "contrato CLT"
        return None

    def filtrar_experiencia(self, v: Vaga) -> str | None:
        texto = normalizar(v.descricao)
        # "1 a 3 anos" / "1-3 anos" conta pelo mínimo da faixa.
        texto = re.sub(r"(\d{1,2})\s*(?:a|-|ate)\s*\d{1,2}\s*(anos?)", r"\1 \2", texto)
        anos =[int(n) for p in _ANOS for n in p.findall(texto)]
        anos = [a for a in anos if 0 < a < 30]
        if anos and min(anos) > self.max_anos:
            return f"pede {min(anos)}+ anos de experiência"
        return None

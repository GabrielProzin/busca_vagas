"""Utilidades de texto: normalização, limpeza de HTML, emails, frases."""
from __future__ import annotations

import html
import re
import unicodedata

_TAG = re.compile(r"<[^>]+>")
_BLOCO = re.compile(r"</?(p|div|li|ul|ol|br|h\d|tr)[^>]*>", re.I)
_ESPACOS = re.compile(r"[ \t ]+")
_EMAIL = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
# Emails que aparecem em vagas mas não são de recrutador.
_EMAIL_IGNORAR = re.compile(r"(noreply|no-reply|naoresponda|exemplo|example|privacidade|privacy|lgpd|dpo|ouvidoria|sac@)", re.I)


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def normalizar(s: str | None) -> str:
    """Minúsculo, sem acento, espaços colapsados. Base de toda comparação por regex."""
    if not s:
        return ""
    return _ESPACOS.sub(" ", sem_acento(s).lower()).strip()


# Cidades: a mesma cidade aparece escrita de muitos jeitos nas vagas ("Goiânia - GO", "goiania/go", "GOIÂNIA (GO)",
# "Goiânia, Goiás", "Gyn"). Tudo vira o mesmo nome-chave. Ver docs/spec.md, "Preferências".
UF_NOMES = {
    "ac": "acre", "al": "alagoas", "ap": "amapa", "am": "amazonas", "ba": "bahia", "ce": "ceara", "df": "distrito federal",
    "es": "espirito santo", "go": "goias", "ma": "maranhao", "mt": "mato grosso", "ms": "mato grosso do sul",
    "mg": "minas gerais", "pa": "para", "pb": "paraiba", "pr": "parana", "pe": "pernambuco", "pi": "piaui",
    "rj": "rio de janeiro", "rn": "rio grande do norte", "rs": "rio grande do sul", "ro": "rondonia", "rr": "roraima",
    "sc": "santa catarina", "sp": "sao paulo", "se": "sergipe", "to": "tocantins",
}
_UF_DO_NOME = {nome: uf for uf, nome in UF_NOMES.items()}
# Apelidos comuns em posts. Só os que não confundem com outra cidade.
APELIDOS_CIDADE = {"bh": "belo horizonte", "poa": "porto alegre", "floripa": "florianopolis", "sampa": "sao paulo",
                   "bsb": "brasilia", "gyn": "goiania", "sjc": "sao jose dos campos", "rp": "ribeirao preto"}
# Separa nome de qualificadores: " - ", " | ", "/", ",", "(". Hífen sem espaço é parte do nome ("Mogi-Mirim").
_SEPARADOR = re.compile(r"\s+[-–—|]\s+|\s*[/,;()|]\s*")
_UF_COLADA = re.compile(r"^(.*\S)-(" + "|".join(UF_NOMES) + r")$")
_NAO_LETRA = re.compile(r"[^a-z0-9 ]+")
_D_APOSTROFO = re.compile(r"\bd (?=[aeiou])")  # "d'Oeste" e "D Oeste" viram "doeste"


def separar_cidade(s: str | None) -> tuple[str, str | None]:
    """'Goiânia - GO' -> ('goiania', 'go'). Nome sem acento, minúsculo, sem pontuação; estado se vier junto."""
    t = normalizar(s)
    if not t:
        return "", None
    partes = [p.strip() for p in _SEPARADOR.split(t) if p and p.strip()]
    if not partes:
        return "", None
    nome, uf = partes[0], None
    for p in partes[1:]:
        p = _NAO_LETRA.sub("", p).strip()
        if p in UF_NOMES or p in _UF_DO_NOME:
            uf = p if p in UF_NOMES else _UF_DO_NOME[p]
            break
    m = _UF_COLADA.match(nome)
    if m and uf is None:  # "Goiania-GO"
        nome, uf = m.group(1), m.group(2)
    nome = _ESPACOS.sub(" ", _NAO_LETRA.sub(" ", nome.replace("'", " ").replace("’", " "))).strip()
    nome = _D_APOSTROFO.sub("d", nome)
    return APELIDOS_CIDADE.get(nome, nome), uf


def texto_para_cidades(s: str | None) -> str:
    """Texto normalizado do jeito das chaves de cidade, para procurar a cidade no meio da descrição."""
    t = _ESPACOS.sub(" ", _NAO_LETRA.sub(" ", normalizar(s).replace("'", " ").replace("’", " "))).strip()
    return _D_APOSTROFO.sub("d", t)


def chave_cidade(s: str | None) -> str:
    """Só o nome-chave da cidade (ver separar_cidade)."""
    return separar_cidade(s)[0]


def limpar_html(s: str | None) -> str:
    """HTML -> texto com quebras de linha nos blocos (para separar requisitos)."""
    if not s:
        return ""
    s = _BLOCO.sub("\n", s)
    s = _TAG.sub(" ", s)
    s = html.unescape(s)
    linhas = [_ESPACOS.sub(" ", l).strip() for l in s.splitlines()]
    return "\n".join(l for l in linhas if l)


def extrair_emails(texto: str) -> list[str]:
    vistos: list[str] = []
    for e in _EMAIL.findall(texto or ""):
        e = e.strip(".").lower()
        if _EMAIL_IGNORAR.search(e) or e in vistos:
            continue
        if e.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")):
            continue
        vistos.append(e)
    return vistos


def frases_relevantes(texto: str, min_chars: int = 25, max_chars: int = 240, limite: int = 40) -> list[str]:
    """Quebra a descrição em linhas/frases curtas, que é o que o modelo de embeddings compara bem."""
    pedacos: list[str] = []
    for linha in (texto or "").splitlines():
        linha = linha.strip(" -•*·\t")
        if not linha:
            continue
        for frase in re.split(r"(?<=[.;!?])\s+", linha):
            frase = frase.strip()
            if len(frase) < min_chars:
                continue
            pedacos.append(frase[:max_chars])
    # remove duplicatas mantendo a ordem
    vistos, unicos = set(), []
    for p in pedacos:
        k = normalizar(p)
        if k not in vistos:
            vistos.add(k)
            unicos.append(p)
    return unicos[:limite]


def compilar(padroes: list[str]) -> re.Pattern:
    """Lista de regex -> um padrão só, comparável com texto normalizado.

    Os padrões também perdem acento ('sênior' -> 'senior'). Não use escapes em
    maiúscula (\\S, \\W...) nos YAMLs, porque o padrão é passado para minúsculo.
    """
    if not padroes:
        return re.compile(r"(?!x)x")
    return re.compile("|".join(f"(?:{sem_acento(p).lower()})" for p in padroes))

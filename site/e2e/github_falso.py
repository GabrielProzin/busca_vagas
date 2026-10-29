"""GitHub falso para os testes do assistente de instalação (sem internet e sem token de verdade).

Responde só o que o site usa (lib/github.ts) para o repositório "exemplo/perfilup" e guarda o que recebeu.
GET /_estado devolve os secrets gravados (só os nomes), os workflows ligados e disparados e os arquivos salvos.
"""
import base64
import json
import re
from http.server import BaseHTTPRequestHandler, HTTPServer

REPO = "/repos/exemplo/perfilup"
TOKEN = "github_pat_" + "x" * 40
ESTADO = {"secrets": [], "ligados": [], "disparos": [], "arquivos": {}, "commits": 0}
ARQUIVOS = {"perfil/perfil.yaml": "# Perfil do candidato (modelo).\nnome: Modelo\nhabilidades: {}\ndestaques: []\n"}
ARVORES = {}


class H(BaseHTTPRequestHandler):
    def _json(self, status, dados=None):
        b = json.dumps(dados).encode() if dados is not None else b""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _corpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def _autorizado(self):
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self._json(401, {"message": "Bad credentials"})
            return False
        return True

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/_estado":
            return self._json(200, ESTADO)
        if p == "/repos/GabrielProzin/busca_vagas/commits/main":  # versão nova na origem
            return self._json(200, {"sha": "f" * 40, "commit": {"message": "Tela nova de exemplo\n\ndetalhes", "committer": {"date": "2099-01-01T00:00:00Z"}}})
        if not self._autorizado():
            return
        if p == REPO:
            return self._json(200, {"default_branch": "main", "created_at": "2026-10-21T00:00:00Z"})
        if p == f"{REPO}/actions/secrets/public-key":
            return self._json(200, {"key": base64.b64encode(bytes(range(32))).decode(), "key_id": "123"})
        if p == f"{REPO}/actions/workflows":
            return self._json(200, {"workflows": []})
        m = re.fullmatch(f"{REPO}/contents/(.+)", p)
        if m:
            texto = ARQUIVOS.get(m.group(1))
            return self._json(200, {"content": base64.b64encode(texto.encode()).decode(), "encoding": "base64"}) if texto else self._json(404, {})
        if p == f"{REPO}/git/ref/heads/main":
            return self._json(200, {"object": {"sha": f"c{ESTADO['commits']}"}})
        if re.fullmatch(f"{REPO}/git/commits/.+", p):
            return self._json(200, {"tree": {"sha": "arvore-base"}})
        m = re.fullmatch(f"{REPO}/actions/workflows/(.+)/runs", p)
        if m:
            return self._json(200, {"workflow_runs": []})
        self._json(404, {"message": "Not Found"})

    def do_PUT(self):
        if not self._autorizado():
            return
        p = self.path
        m = re.fullmatch(f"{REPO}/actions/secrets/(\\w+)", p)
        if m:
            corpo = self._corpo()
            # Selado com a chave pública: 32 bytes da chave efêmera + 16 do MAC + a mensagem.
            assert corpo["key_id"] == "123" and len(base64.b64decode(corpo["encrypted_value"])) > 48
            ESTADO["secrets"].append(m.group(1))
            return self._json(201, {})
        m = re.fullmatch(f"{REPO}/actions/workflows/(.+)/enable", p)
        if m:
            ESTADO["ligados"].append(m.group(1))
            return self._json(204)
        self._json(404, {})

    def do_POST(self):
        if not self._autorizado():
            return
        p, corpo = self.path, self._corpo()
        m = re.fullmatch(f"{REPO}/actions/workflows/(.+)/dispatches", p)
        if m:
            ESTADO["disparos"].append({"arquivo": m.group(1), "ref": corpo.get("ref"), "inputs": corpo.get("inputs")})
            return self._json(204)
        if p == f"{REPO}/git/trees":
            ARVORES["nova"] = {i["path"]: i["content"] for i in corpo["tree"]}
            return self._json(201, {"sha": "nova"})
        if p == f"{REPO}/git/commits":
            ESTADO["ultima_mensagem"] = corpo["message"]
            return self._json(201, {"sha": "commit-novo"})
        self._json(404, {})

    def do_PATCH(self):
        if not self._autorizado():
            return
        if self.path == f"{REPO}/git/refs/heads/main" and self._corpo().get("sha") == "commit-novo":
            ESTADO["commits"] += 1
            ESTADO["arquivos"].update(ARVORES.pop("nova", {}))
            ARQUIVOS.update(ESTADO["arquivos"])
            return self._json(200, {})
        self._json(422, {})

    def log_message(self, *a):
        pass


HTTPServer(("127.0.0.1", 3998), H).serve_forever()

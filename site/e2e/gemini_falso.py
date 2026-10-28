"""Gemini falso para os testes do site (sem internet e sem gastar cota).

Simula também o fallback de modelos: o Flash "3.5" não existe (404) e o "3.1" está sem cota (429),
então os emails precisam sair pelo Flash-Lite.
"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        prompt = corpo["contents"][0]["parts"][0]["text"]
        modelo = self.path.split("/models/")[1].split(":")[0]
        if modelo in ("gemini-3.5-flash", "gemini-3.5-flash-lite"):
            self.send_response(404); self.end_headers(); return
        if modelo == "gemini-3.1-flash":
            self.send_response(429); self.end_headers(); return
        if "Você revisa currículos" in prompt:
            out = {"escrita": 78, "escrita_motivo": "Frases objetivas e com verbos de ação.", "nivel": "junior",
                   "nivel_motivo": "Quase 2 anos em dados, com pipelines e dashboards em produção.",
                   "proximo_nivel": ["Mostrar uma decisão técnica sua e o impacto dela"],
                   "fortes": ["Resultados com números na experiência recente", "Mistura de engenharia e análise de dados"],
                   "melhorias": [{"trecho": "Consultas SQL e relatórios gerenciais", "sugestao": "Diga para quem eram os relatórios e o que mudou."},
                                 {"trecho": "Liderei uma equipe de dez analistas", "sugestao": "Conte o resultado do protótipo de NPS para o negócio, não só os testes."}],
                   "resumo": "Currículo forte para júnior."}
        elif "Compare o currículo com a vaga" in prompt:
            perguntas = prompt.split("PERGUNTAS DO FORMULÁRIO")[1].strip().splitlines() if "PERGUNTAS DO FORMULÁRIO" in prompt else []
            def responder(p):
                if "salar" in p.lower():
                    return {"pergunta": p, "resposta": "Minha pretensão é de R$ ____ no regime CLT, aberta a conversar conforme os benefícios.",
                            "confirmar": "O currículo não tem pretensão salarial: preencha o valor antes de enviar."}
                return {"pergunta": p, "resposta": "A vaga junta SQL e Power BI para montar dashboards — foi o que fiz na Pacto Soluções ao migrar mais de 20 dashboards de KPIs, conferindo cada número com a fonte.",
                        "confirmar": None}
            out = {"conexao": 81, "destacar": ["Migração de mais de 20 dashboards para o Power BI", "SQL e DAX no dia a dia"],
                   "lacunas": ["Excel avançado"], "respostas": [responder(p) for p in perguntas]}
        elif "Resuma esta vaga" in prompt:
            out = {"frase": "Criar dashboards e relatórios para a diretoria.", "atividades": ["Montar dashboards no Power BI"],
                   "obrigatorios": ["SQL", "Power BI"], "diferenciais": ["Python"], "contrato": "CLT", "salario": None,
                   "local": "Remoto", "beneficios": ["Plano de saúde"], "atencao": []}
        elif "follow-up" in prompt:
            out = {"corpo": "Olá, tudo bem? Escrevo para acompanhar minha candidatura à vaga. Sigo com interesse: migrei mais de 20 dashboards para o Power BI. Fico à disposição para conversar."}
        elif '"assunto"' in prompt:
            out = {"assunto": "Candidatura: Analista de BI Jr – Gabriel Mendes",
                   "corpo": "Olá, tudo bem? Vi a vaga de Analista de BI Jr e quero me candidatar. Migrei mais de 20 dashboards de KPIs para o Power BI, conferindo cada número com a fonte. O currículo vai em anexo."}
        else:
            nao_vaga = "HOTLIST" in prompt
            out = {"e_vaga": not nao_vaga, "titulo": "Analista de Dados Júnior", "empresa": "Exemplo Contrata", "emails": ["vagas@contrata.exemplo.com"],
                   "cidade": None, "estado": None, "modalidade": "remoto", "nivel": "junior", "idioma": "pt", "nota": 84,
                   "motivos": ["Pede SQL e Power BI, que estão no currículo"], "habilidades_ok": ["SQL", "Power BI"], "habilidades_faltando": []}
        b = json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(out, ensure_ascii=False)}]}}]}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b)))
        self.end_headers(); self.wfile.write(b)

    def log_message(self, *a):
        pass


HTTPServer(("127.0.0.1", 3999), H).serve_forever()

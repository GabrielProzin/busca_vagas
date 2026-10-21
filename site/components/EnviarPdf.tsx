"use client";

import { useActionState } from "react";
import { enviarCurriculoPdf, type EstadoEmail } from "@/app/acoes";

export default function EnviarPdf() {
  const [estado, acao, enviando] = useActionState<EstadoEmail, FormData>(enviarCurriculoPdf, null);
  return (
    <form action={acao} className="formulario">
      <label>
        Arquivo PDF (até 3,8 MB)
        <input type="file" name="pdf" accept="application/pdf,.pdf" required />
      </label>
      <div>
        <button className="botao primario" type="submit" disabled={enviando}>
          {enviando ? "Enviando…" : "Salvar currículo"}
        </button>
      </div>
      {estado?.ok ? <p className="aviso ok">{estado.ok}</p> : null}
      {estado?.erro ? <p className="erro" role="alert">{estado.erro}</p> : null}
    </form>
  );
}

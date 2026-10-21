"use client";

import { useActionState } from "react";
import { enviarCurriculoPdf, type EstadoEmail } from "@/app/acoes";

export default function EnviarPdf() {
  const [estado, acao, enviando] = useActionState<EstadoEmail, FormData>(enviarCurriculoPdf, null);
  return (
    <form action={acao} className="formulario">
      <label>
        Currículo em PDF (até 3,8 MB)
        <input type="file" name="pdf" accept="application/pdf,.pdf" required />
      </label>
      <button className="botao primario" type="submit" disabled={enviando} style={{ alignSelf: "flex-start" }}>
        {enviando ? "Enviando…" : "Salvar currículo"}
      </button>
      {estado?.ok ? <p className="aviso ok">{estado.ok}</p> : null}
      {estado?.erro ? <p className="erro" role="alert">{estado.erro}</p> : null}
    </form>
  );
}

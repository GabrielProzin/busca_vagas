import Moldura from "@/components/Moldura";
import Triagem, { type ItemTriagem } from "@/components/Triagem";
import { listarVagas } from "@/lib/db";
import { fonte, habilidade, idUrl, local, naFonte, quando } from "@/lib/formato";
import { ehNova } from "@/lib/tipos";

export const dynamic = "force-dynamic";

// Triagem rápida: as vagas novas uma por vez, da maior nota para a menor (principal antes de vale tentar).
export default async function PaginaTriagem() {
  const vagas = await listarVagas().catch((e) => {
    console.error("triagem:", e);
    return [];
  });
  const novas = vagas
    .filter(ehNova)
    .sort((a, b) => Number(b.lista === "principal") - Number(a.lista === "principal") || (b.nota ?? 0) - (a.nota ?? 0));
  const itens: ItemTriagem[] = novas.map((v) => ({
    id: v.id,
    titulo: v.titulo,
    empresa: v.empresa || "Empresa não informada",
    local: local(v),
    fonte: fonte(v.fonte),
    naFonte: naFonte(v.fonte),
    quando: quando(v.publicada_em),
    nota: Math.round(v.nota ?? 0),
    valeTentar: v.lista === "vale_tentar",
    email: v.email_contato,
    url: v.url,
    href: idUrl(v.id),
    frase: v.resumo?.frase || null,
    motivos: v.motivos.filter((m) => !m.startsWith("Pede ") && !m.startsWith("Trecho mais parecido")).slice(0, 3),
    ok: v.habilidades_ok.slice(0, 6).map(habilidade),
    falta: v.habilidades_faltando.slice(0, 3),
    trecho: (v.descricao ?? "").replace(/\s+\n/g, "\n").trim().slice(0, 900),
  }));

  return (
    <Moldura
      atual="/triagem"
      titulo="Triagem rápida"
      subtitulo="Uma vaga por vez: descarte o que não serve e separe o que vale a candidatura. Cada decisão também ensina o ranking."
    >
      <Triagem itens={itens} />
    </Moldura>
  );
}

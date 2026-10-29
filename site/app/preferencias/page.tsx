import Moldura from "@/components/Moldura";
import PainelPreferencias from "@/components/FormPreferencias";
import { lerPreferencias } from "@/lib/db";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

// Preferências da busca: forma de trabalho, cidades, nível, termos e palavras a evitar (docs/spec.md, "Preferências").
export default async function PaginaPreferencias() {
  const { prefs, salvas_em } = await lerPreferencias();
  return (
    <Moldura
      atual="/preferencias"
      titulo="Preferências da busca"
      subtitulo={`O que entra na sua lista de vagas.${salvas_em ? ` Salvas em ${fmt.format(new Date(salvas_em))}.` : ""}`}
    >
      <PainelPreferencias prefs={prefs} salvasEm={salvas_em} />
    </Moldura>
  );
}

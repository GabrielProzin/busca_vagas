import { redirect } from "next/navigation";

// O "Mapa das vagas" virou "Tipos de vaga".
export default function PaginaMapa() {
  redirect("/tipos");
}

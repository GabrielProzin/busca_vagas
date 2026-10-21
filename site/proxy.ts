import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, sessaoValida } from "./lib/sessao";

// Tudo exige login, menos a própria página de login.
export default async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/login") return NextResponse.next();
  if (await sessaoValida(req.cookies.get(COOKIE_SESSAO)?.value)) return NextResponse.next();
  const url = new URL("/login", req.nextUrl);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};

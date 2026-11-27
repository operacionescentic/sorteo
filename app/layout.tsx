import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sorteo CENTIC — ISO Power Pack",
  description: "Inscríbete al sorteo semanal de CENTIC: 50% y 30% de descuento en tu paquete ISO.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            CENTIC <span>SORTEO</span>
          </Link>
          <nav>
            <Link href="/">Inscripción</Link>
            <Link href="/en-vivo">En vivo</Link>
            <Link href="/ganadores">Ganadores</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="footer">© {new Date().getFullYear()} CENTIC S.A.S.</footer>
      </body>
    </html>
  );
}

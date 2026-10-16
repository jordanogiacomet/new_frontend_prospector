import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prospecta",
  description: "Importe listas, acompanhe os envios e revise as análises das empresas.",
  applicationName: "Prospecta",
  referrer: "no-referrer",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

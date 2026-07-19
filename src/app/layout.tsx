import type { Metadata } from "next";
import { Caveat, Poppins } from "next/font/google";
import "./globals.css";
import { Nav } from "./Nav";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Revanto",
  description: "Gestão financeira compartilhada",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${poppins.variable} ${caveat.variable} h-full antialiased`}
    >
      <body
        className="bg-background text-on-surface flex min-h-full flex-col font-sans"
        suppressHydrationWarning
      >
        <Nav />
        {children}
      </body>
    </html>
  );
}

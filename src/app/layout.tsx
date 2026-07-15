import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "./Nav";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "REVANTO",
  description: "Gestão financeira compartilhada",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
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

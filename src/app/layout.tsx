import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TVTracker",
  description: "Il tuo diario di serie TV e film.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={inter.variable}>
      <body className="antialiased">
        <Nav />
        <Toaster />
        {/* Offset for the fixed sidebar on desktop; clear the bottom bar on mobile */}
        <div className="flex min-h-screen flex-col md:pl-[248px]">
          <main className="flex-1 px-5 pb-28 pt-6 sm:px-8 md:px-10 md:pb-10 md:pt-10">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
          <footer className="mb-20 border-t border-line px-5 py-6 sm:px-8 md:mb-0 md:px-10">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl leading-relaxed">
                Questo prodotto usa l&apos;API TMDB ma non è approvato o
                certificato da TMDB.
              </p>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2 py-1 font-semibold tracking-wide text-muted">
                <span className="text-accent">◆</span> TMDB
              </span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

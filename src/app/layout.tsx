import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GigMarket — Find the perfect freelance services",
  description:
    "A marketplace to buy and sell freelance gigs across design, development, writing, video, and more.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 text-xl font-extrabold">
              <span className="text-primary">Gig</span>
              <span>Market</span>
              <span className="text-primary">.</span>
            </Link>
            <nav className="flex items-center gap-2 sm:gap-4">
              <Link
                href="/"
                className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:text-foreground"
              >
                Browse
              </Link>
              <Link
                href="/orders"
                className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:text-foreground"
              >
                Orders
              </Link>
              <Link
                href="/post"
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark"
              >
                + Post a gig
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted">
            Built with Next.js, Prisma &amp; SQLite — a demo Gig Marketplace.
          </div>
        </footer>
      </body>
    </html>
  );
}

import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CATEGORIES } from "@/lib/categories";
import GigCard from "@/components/GigCard";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;

  const where: Prisma.GigWhereInput = {};
  if (category && CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    where.category = category;
  }
  if (q && q.trim()) {
    where.title = { contains: q.trim() };
  }

  const gigs = await prisma.gig.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <section className="bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h1 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-5xl">
            Find the perfect freelance services for your business
          </h1>
          <p className="mt-4 max-w-xl text-base text-white/90 sm:text-lg">
            Browse thousands of gigs from talented freelancers. Order in minutes.
          </p>
          <form action="/" className="mt-8 flex max-w-xl gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Try 'logo design' or 'web app'"
              className="w-full rounded-lg border border-white/20 bg-white px-4 py-3 text-foreground shadow-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-white/60"
            />
            <button
              type="submit"
              className="rounded-lg bg-foreground px-6 py-3 font-semibold text-white transition-colors hover:bg-black"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <CategoryPill label="All" href="/" active={!category} />
          {CATEGORIES.map((c) => (
            <CategoryPill
              key={c}
              label={c}
              href={`/?category=${encodeURIComponent(c)}`}
              active={category === c}
            />
          ))}
        </div>

        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">
            {category ? `${category} gigs` : "Popular gigs"}
            {q ? ` matching “${q}”` : ""}
          </h2>
          <span className="text-sm text-muted">{gigs.length} results</span>
        </div>

        {gigs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted">
            No gigs found.{" "}
            <Link href="/post" className="font-semibold text-primary-dark underline">
              Post the first one
            </Link>
            .
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {gigs.map((gig) => (
              <GigCard key={gig.id} gig={gig} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CategoryPill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-white"
          : "border-border bg-card text-muted hover:border-primary hover:text-primary-dark"
      }`}
    >
      {label}
    </Link>
  );
}

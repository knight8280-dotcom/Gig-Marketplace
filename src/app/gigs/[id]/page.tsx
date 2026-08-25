import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import OrderForm from "@/components/OrderForm";

export const dynamic = "force-dynamic";

export default async function GigDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gig = await prisma.gig.findUnique({ where: { id } });

  if (!gig) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/"
        className="text-sm font-medium text-muted hover:text-foreground"
      >
        ← Back to gigs
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <span className="inline-block rounded-full bg-card px-3 py-1 text-xs font-medium text-muted">
            {gig.category}
          </span>
          <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">
            {gig.title}
          </h1>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-2xl">
              <span aria-hidden>{gig.sellerEmoji}</span>
            </div>
            <div>
              <p className="font-semibold">{gig.sellerName}</p>
              <p className="text-sm text-amber-500">
                ★{" "}
                <span className="font-semibold text-foreground">
                  {gig.rating.toFixed(1)}
                </span>{" "}
                <span className="text-muted">({gig.reviews} reviews)</span>
              </p>
            </div>
          </div>

          <div className="mt-6 flex h-56 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/25 text-7xl">
            <span aria-hidden>{gig.sellerEmoji}</span>
          </div>

          <h2 className="mt-8 text-lg font-bold">About this gig</h2>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-foreground/90">
            {gig.description}
          </p>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Price</span>
              <span className="text-2xl font-extrabold">${gig.price}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-muted">
              <span>Delivery time</span>
              <span className="font-medium text-foreground">
                {gig.deliveryDays} days
              </span>
            </div>
            <hr className="my-4 border-border" />
            <h3 className="mb-3 text-base font-bold">Place your order</h3>
            <OrderForm gigId={gig.id} price={gig.price} />
          </div>
        </aside>
      </div>
    </div>
  );
}

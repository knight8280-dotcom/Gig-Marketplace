import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrderConfirmation({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { gig: true },
  });

  if (!order) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl text-white">
            <span aria-hidden>✓</span>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold">Order confirmed!</h1>
            <p className="text-muted">
              Order <span className="font-mono text-sm">{order.id}</span>
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-lg bg-background p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 text-2xl">
              <span aria-hidden>{order.gig.sellerEmoji}</span>
            </div>
            <div>
              <p className="font-semibold">{order.gig.title}</p>
              <p className="text-sm text-muted">by {order.gig.sellerName}</p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted">Buyer</dt>
            <dd className="text-right font-medium">{order.buyerName}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="text-right font-medium">{order.buyerEmail}</dd>
            <dt className="text-muted">Delivery</dt>
            <dd className="text-right font-medium">
              {order.gig.deliveryDays} days
            </dd>
            <dt className="text-muted">Status</dt>
            <dd className="text-right">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-700">
                {order.status}
              </span>
            </dd>
            <dt className="text-muted">Total</dt>
            <dd className="text-right text-lg font-extrabold">
              ${order.gig.price}
            </dd>
          </dl>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium text-muted">Your requirements</p>
          <p className="mt-1 whitespace-pre-line rounded-lg border border-border p-3 text-sm">
            {order.requirements}
          </p>
        </div>

        <div className="mt-8 flex gap-3">
          <Link
            href="/orders"
            className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-dark"
          >
            View all orders
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-border px-5 py-2.5 font-semibold text-foreground hover:bg-background"
          >
            Keep browsing
          </Link>
        </div>
      </div>
    </div>
  );
}

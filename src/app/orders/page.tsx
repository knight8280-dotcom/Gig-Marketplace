import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Orders — GigMarket",
};

export default async function OrdersPage() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { gig: true },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Your orders</h1>
      <p className="mt-2 text-muted">Every order placed on GigMarket.</p>

      {orders.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted">
          No orders yet.{" "}
          <Link href="/" className="font-semibold text-primary-dark underline">
            Browse gigs
          </Link>{" "}
          to place your first order.
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-2xl">
                <span aria-hidden>{order.gig.sellerEmoji}</span>
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/orders/${order.id}`}
                  className="line-clamp-1 font-semibold hover:text-primary-dark"
                >
                  {order.gig.title}
                </Link>
                <p className="text-sm text-muted">
                  {order.buyerName} · ${order.gig.price}
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                {order.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

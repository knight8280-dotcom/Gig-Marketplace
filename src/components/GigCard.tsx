import Link from "next/link";

export type GigCardData = {
  id: string;
  title: string;
  category: string;
  price: number;
  deliveryDays: number;
  sellerName: string;
  sellerEmoji: string;
  rating: number;
  reviews: number;
};

export default function GigCard({ gig }: { gig: GigCardData }) {
  return (
    <Link
      href={`/gigs/${gig.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex h-32 items-center justify-center bg-gradient-to-br from-primary/10 to-primary/25 text-5xl">
        <span aria-hidden>{gig.sellerEmoji}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="font-medium text-foreground">{gig.sellerName}</span>
          <span
            className="rounded-full bg-background px-2 py-0.5 text-xs"
            aria-label={`Category: ${gig.category}`}
          >
            {gig.category}
          </span>
        </div>
        <h3 className="line-clamp-2 min-h-[2.75rem] text-sm font-semibold leading-snug group-hover:text-primary-dark">
          {gig.title}
        </h3>
        <div className="flex items-center gap-1 text-sm text-amber-500">
          <span aria-hidden>★</span>
          <span className="font-semibold text-foreground">
            {gig.rating.toFixed(1)}
          </span>
          <span className="text-muted">({gig.reviews})</span>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted">{gig.deliveryDays}-day delivery</span>
          <span className="text-sm text-muted">
            From{" "}
            <span className="text-base font-bold text-foreground">
              ${gig.price}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}

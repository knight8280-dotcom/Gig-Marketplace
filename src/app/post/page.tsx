import PostGigForm from "@/components/PostGigForm";

export const metadata = {
  title: "Post a gig — GigMarket",
};

export default function PostGigPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Post a new gig</h1>
      <p className="mt-2 text-muted">
        Describe your service and start selling on GigMarket.
      </p>
      <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm">
        <PostGigForm />
      </div>
    </div>
  );
}

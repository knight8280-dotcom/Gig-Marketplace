"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";

const EMOJIS = ["🧑‍💻", "🎨", "✍️", "🎬", "🎧", "📈", "📷", "🛠️", "🚀", "💡"];

export default function PostGigForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emoji, setEmoji] = useState(EMOJIS[0]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const payload = {
      title: formData.get("title"),
      description: formData.get("description"),
      category: formData.get("category"),
      price: Number(formData.get("price")),
      deliveryDays: Number(formData.get("deliveryDays")),
      sellerName: formData.get("sellerName"),
      sellerEmoji: emoji,
    };

    try {
      const res = await fetch("/api/gigs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }
      router.push(`/gigs/${json.gig.id}`);
    } catch {
      setError("Network error, please try again");
      setSubmitting(false);
    }
  }

  const field =
    "mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="text-sm font-medium">
        Gig title
        <input
          name="title"
          required
          className={field}
          placeholder="I will design a modern logo for your brand"
        />
      </label>

      <label className="text-sm font-medium">
        Description
        <textarea
          name="description"
          required
          rows={4}
          className={field}
          placeholder="Describe what buyers will get…"
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Category
          <select name="category" required className={field} defaultValue="">
            <option value="" disabled>
              Select a category
            </option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium">
          Your name
          <input
            name="sellerName"
            required
            className={field}
            placeholder="Alex Rivera"
          />
        </label>

        <label className="text-sm font-medium">
          Price (USD)
          <input
            name="price"
            type="number"
            min={1}
            required
            className={field}
            placeholder="75"
          />
        </label>

        <label className="text-sm font-medium">
          Delivery (days)
          <input
            name="deliveryDays"
            type="number"
            min={1}
            required
            className={field}
            placeholder="3"
          />
        </label>
      </div>

      <div className="text-sm font-medium">
        Pick an avatar
        <div className="mt-2 flex flex-wrap gap-2">
          {EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setEmoji(em)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border text-xl transition-colors ${
                emoji === em
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary"
              }`}
              aria-pressed={emoji === em}
            >
              <span aria-hidden>{em}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-primary px-4 py-3 font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Publishing…" : "Publish gig"}
      </button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OrderForm({
  gigId,
  price,
}: {
  gigId: string;
  price: number;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const payload = {
      gigId,
      buyerName: formData.get("buyerName"),
      buyerEmail: formData.get("buyerEmail"),
      requirements: formData.get("requirements"),
    };

    try {
      const res = await fetch("/api/orders", {
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
      router.push(`/orders/${json.order.id}`);
    } catch {
      setError("Network error, please try again");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium">
        Your name
        <input
          name="buyerName"
          required
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          placeholder="Jane Doe"
        />
      </label>
      <label className="text-sm font-medium">
        Email
        <input
          name="buyerEmail"
          type="email"
          required
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          placeholder="jane@example.com"
        />
      </label>
      <label className="text-sm font-medium">
        Requirements
        <textarea
          name="requirements"
          required
          rows={4}
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          placeholder="Describe what you need…"
        />
      </label>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 rounded-lg bg-primary px-4 py-3 font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Placing order…" : `Continue (\$${price})`}
      </button>
    </form>
  );
}

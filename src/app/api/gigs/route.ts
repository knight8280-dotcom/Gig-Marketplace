import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CATEGORIES } from "@/lib/categories";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");

  const where: Prisma.GigWhereInput = {};
  if (category) where.category = category;
  if (q) where.title = { contains: q };

  const gigs = await prisma.gig.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ gigs });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const description =
    typeof data.description === "string" ? data.description.trim() : "";
  const category = typeof data.category === "string" ? data.category : "";
  const price = Number(data.price);
  const deliveryDays = Number(data.deliveryDays);
  const sellerName =
    typeof data.sellerName === "string" ? data.sellerName.trim() : "";
  const sellerEmoji =
    typeof data.sellerEmoji === "string" && data.sellerEmoji.trim()
      ? data.sellerEmoji.trim()
      : "🧑‍💻";

  const errors: string[] = [];
  if (!title) errors.push("title is required");
  if (!description) errors.push("description is required");
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number]))
    errors.push("category is invalid");
  if (!Number.isFinite(price) || price <= 0) errors.push("price must be > 0");
  if (!Number.isFinite(deliveryDays) || deliveryDays <= 0)
    errors.push("deliveryDays must be > 0");
  if (!sellerName) errors.push("sellerName is required");

  if (errors.length) {
    return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
  }

  const gig = await prisma.gig.create({
    data: {
      title,
      description,
      category,
      price: Math.round(price),
      deliveryDays: Math.round(deliveryDays),
      sellerName,
      sellerEmoji,
    },
  });

  return NextResponse.json({ gig }, { status: 201 });
}

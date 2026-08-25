import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { gig: true },
  });
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const gigId = typeof data.gigId === "string" ? data.gigId : "";
  const buyerName =
    typeof data.buyerName === "string" ? data.buyerName.trim() : "";
  const buyerEmail =
    typeof data.buyerEmail === "string" ? data.buyerEmail.trim() : "";
  const requirements =
    typeof data.requirements === "string" ? data.requirements.trim() : "";

  const errors: string[] = [];
  if (!gigId) errors.push("gigId is required");
  if (!buyerName) errors.push("buyerName is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail))
    errors.push("a valid buyerEmail is required");
  if (!requirements) errors.push("requirements are required");

  if (errors.length) {
    return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
  }

  const gig = await prisma.gig.findUnique({ where: { id: gigId } });
  if (!gig) {
    return NextResponse.json({ error: "Gig not found" }, { status: 404 });
  }

  const order = await prisma.order.create({
    data: { gigId, buyerName, buyerEmail, requirements },
  });

  return NextResponse.json({ order }, { status: 201 });
}

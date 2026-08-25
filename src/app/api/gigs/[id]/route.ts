import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const gig = await prisma.gig.findUnique({ where: { id } });
  if (!gig) {
    return NextResponse.json({ error: "Gig not found" }, { status: 404 });
  }
  return NextResponse.json({ gig });
}

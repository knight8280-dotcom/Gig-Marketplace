import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const gigs = [
  {
    title: "I will design a modern, responsive logo for your brand",
    description:
      "Get a unique, professional logo that captures your brand identity. Includes 3 initial concepts, unlimited revisions on the chosen concept, and final files in SVG, PNG, and PDF.",
    category: "Design",
    price: 85,
    deliveryDays: 2,
    sellerName: "Ava Chen",
    sellerEmoji: "🎨",
    rating: 4.9,
    reviews: 312,
  },
  {
    title: "I will build a full-stack web app with Next.js and React",
    description:
      "Ship a production-ready web application. Includes responsive UI, REST API, database integration, and deployment. Perfect for MVPs and internal tools.",
    category: "Programming",
    price: 450,
    deliveryDays: 7,
    sellerName: "Marcus Lee",
    sellerEmoji: "🧑‍💻",
    rating: 5.0,
    reviews: 128,
  },
  {
    title: "I will write SEO-optimized blog posts that rank",
    description:
      "Engaging, well-researched articles tailored to your niche. Includes keyword research, meta description, and up to 1500 words of original content.",
    category: "Writing",
    price: 60,
    deliveryDays: 3,
    sellerName: "Priya Nair",
    sellerEmoji: "✍️",
    rating: 4.8,
    reviews: 204,
  },
  {
    title: "I will edit your YouTube videos with pro transitions",
    description:
      "Cinematic edits with color grading, sound design, captions, and thumbnails. Turn raw footage into content that keeps viewers watching.",
    category: "Video",
    price: 120,
    deliveryDays: 4,
    sellerName: "Diego Santos",
    sellerEmoji: "🎬",
    rating: 4.9,
    reviews: 89,
  },
  {
    title: "I will produce a custom lo-fi track for your project",
    description:
      "Original, royalty-free music composed for your brand, game, or video. Includes stems and commercial license.",
    category: "Music",
    price: 95,
    deliveryDays: 5,
    sellerName: "Nia Okafor",
    sellerEmoji: "🎧",
    rating: 5.0,
    reviews: 47,
  },
  {
    title: "I will set up your paid ads on Google and Meta",
    description:
      "Full campaign setup with audience targeting, conversion tracking, and a 2-week optimization plan to maximize your ROAS.",
    category: "Marketing",
    price: 200,
    deliveryDays: 3,
    sellerName: "Tom Fischer",
    sellerEmoji: "📈",
    rating: 4.7,
    reviews: 156,
  },
];

async function main() {
  const existing = await prisma.gig.count();
  if (existing > 0) {
    console.log(`Seed skipped: ${existing} gigs already present.`);
    return;
  }

  for (const gig of gigs) {
    await prisma.gig.create({ data: gig });
  }
  console.log(`Seeded ${gigs.length} gigs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

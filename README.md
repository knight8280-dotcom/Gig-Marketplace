# Gig-Marketplace

A demo freelance **gig marketplace** built with **Next.js 16 (App Router)**, **React 19**, **Prisma**, and **SQLite**. Browse gigs, post your own, and place orders end to end.

## Features

- Browse gigs with search and category filtering (home page)
- Gig detail pages with an order form
- Post a new gig (create flow)
- Place an order and view a confirmation
- Orders list page
- JSON REST API under `/api` (`/api/gigs`, `/api/gigs/[id]`, `/api/orders`, `/api/orders/[id]`)

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router, Server Components, Route Handlers)
- React 19 + TypeScript
- Tailwind CSS v4
- Prisma ORM with a local SQLite database

## Getting started

```bash
npm install          # installs deps and generates the Prisma client (postinstall)
npm run db:setup     # creates the SQLite schema and seeds sample gigs
npm run dev          # starts the dev server on http://localhost:3000
```

Then open [http://localhost:3000](http://localhost:3000).

## Useful scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Sync the Prisma schema to SQLite |
| `npm run db:seed` | Seed sample gigs (idempotent) |
| `npm run db:setup` | `db:push` + `db:seed` |

## Database

The SQLite database lives at `prisma/dev.db` (git-ignored). The schema is defined in
[`prisma/schema.prisma`](prisma/schema.prisma). Seed data is in
[`prisma/seed.ts`](prisma/seed.ts) and only inserts when the table is empty.

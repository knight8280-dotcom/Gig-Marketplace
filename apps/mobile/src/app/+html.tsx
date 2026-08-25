import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Static HTML shell wrapped around every exported web page.
 *
 * This file is web-only and is evaluated at export time, so anything set here
 * lands in the prerendered markup — what browsers, crawlers, and link previews
 * read before any JavaScript runs.
 *
 * Title and description are deliberately NOT set here: expo-router renders its
 * own <title> through react-helmet ahead of anything in this file, and the
 * first <title> in a document wins. They are owned by `<Head>` in the root
 * layout instead, which also lets individual screens override them.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <meta name="theme-color" content="#3c87f7" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />

        {/*
          `ScrollViewStyleReset` sets the root to a full-height flex container
          and moves scrolling inside ScrollViews. Every screen — the landing
          page included — depends on that, so the rules below are cosmetic only:
          overriding the height/overflow rules collapses the flex root and
          renders a blank page.
        */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: RESET }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const RESET = `
body {
  background-color: #ffffff;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
@media (prefers-color-scheme: dark) {
  body { background-color: #000000; }
}
/* Keyboard focus stays visible; pointer focus does not draw a ring. */
:focus-visible {
  outline: 2px solid #2F6FED;
  outline-offset: 2px;
}
`;

import Head from 'expo-router/head';

export const SITE_NAME = 'Local Gig Marketplace';
const DEFAULT_TITLE = `${SITE_NAME} — post a local job, or find nearby work`;
const DEFAULT_DESCRIPTION =
  'Post a local job in minutes, or find nearby work and get paid. Local Gig Marketplace connects people who need jobs done with people who want flexible local work.';

interface Props {
  /** Page title. Omit for the site-wide default. */
  title?: string;
  description?: string;
}

/**
 * Document title and description for a page.
 *
 * expo-router always emits a react-helmet `<title>` before anything in
 * `+html.tsx`, and the first `<title>` in a document wins — so the head has to
 * be set through this component rather than in the HTML shell. Rendering it
 * deeper in the tree overrides a shallower one, which is how a screen sets its
 * own title over the root layout's default.
 */
export function SiteHead({ title, description = DEFAULT_DESCRIPTION }: Props) {
  const resolved = title ? `${title} · ${SITE_NAME}` : DEFAULT_TITLE;
  return (
    <Head>
      <title>{resolved}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={resolved} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta name="twitter:title" content={resolved} />
      <meta name="twitter:description" content={description} />
    </Head>
  );
}

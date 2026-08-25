/**
 * Web build: card entry requires the native Stripe payment sheet.
 * This is an honest capability flag — no fake card forms on web.
 */
export const cardEntrySupported = false;

export async function presentCardSetup(_clientSecret: string): Promise<{ completed: boolean; message?: string }> {
  return {
    completed: false,
    message: 'Card entry is available in the iOS/Android app (Stripe payment sheet).',
  };
}

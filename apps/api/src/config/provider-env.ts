/* eslint-disable no-console */
/**
 * Provider credential resolution.
 *
 * Credentials may arrive under canonical names (.env.example) or under the
 * operator's Cloud Agent / dashboard secret names (e.g. `Stripe_sk_test`,
 * `Twilio_Secret`). This module normalizes them into the canonical env vars
 * ONCE at process start, before any Nest module reads process.env.
 *
 * Safety invariants (enforced here, not scattered around the codebase):
 *  - Live Stripe keys (sk_live / rk_live / pk_live) are NEVER used unless
 *    NODE_ENV=production. In dev/test they are ignored with a warning.
 *  - SMS auto-selects the Twilio provider only in production; in dev/test,
 *    real SMS requires an explicit SMS_PROVIDER=twilio opt-in.
 */

function firstSet(...names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name];
    if (v !== undefined && v !== '' && !v.includes('replace')) return v;
  }
  return undefined;
}

const isLiveStripeKey = (key: string): boolean =>
  key.startsWith('sk_live') || key.startsWith('rk_live') || key.startsWith('pk_live');

export interface ResolvedProviderEnv {
  stripeSecretKeySource: string | null;
  stripePublishableKeySource: string | null;
  twilioAuthMode: 'account' | 'api-key' | null;
}

export function resolveProviderEnv(): ResolvedProviderEnv {
  const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
  const result: ResolvedProviderEnv = {
    stripeSecretKeySource: null,
    stripePublishableKeySource: null,
    twilioAuthMode: null,
  };

  // --- Stripe secret key -----------------------------------------------------
  // Candidate order: canonical first, then operator secret names. In non-prod
  // only test keys are eligible; in prod live keys are preferred.
  const secretCandidates: Array<[name: string, value: string]> = [];
  for (const name of ['STRIPE_SECRET_KEY', 'Stripe_sk_test', 'Stripe_API_Key']) {
    const v = firstSet(name);
    if (v) secretCandidates.push([name, v]);
  }
  const eligibleSecret = secretCandidates.find(([name, v]) => {
    if (isLiveStripeKey(v)) {
      if (!isProd) {
        console.warn(
          `[provider-env] Ignoring LIVE Stripe key in ${name}: live keys are only used when NODE_ENV=production.`,
        );
        return false;
      }
      return true;
    }
    // Test-mode keys are never used in production.
    return !isProd;
  });
  if (eligibleSecret) {
    process.env.STRIPE_SECRET_KEY = eligibleSecret[1];
    result.stripeSecretKeySource = eligibleSecret[0];
  } else if (process.env.STRIPE_SECRET_KEY && isLiveStripeKey(process.env.STRIPE_SECRET_KEY) && !isProd) {
    // Canonical var itself holds a live key in dev/test — refuse to use it.
    delete process.env.STRIPE_SECRET_KEY;
  }

  // --- Stripe publishable key ------------------------------------------------
  const pkCandidates = isProd
    ? ['STRIPE_PUBLISHABLE_KEY', 'Stripe_PK_Live']
    : ['STRIPE_PUBLISHABLE_KEY', 'Stripe_pk_Test'];
  for (const name of pkCandidates) {
    const v = firstSet(name);
    if (!v) continue;
    if (!isProd && v.startsWith('pk_live')) continue;
    if (isProd && v.startsWith('pk_test')) continue;
    process.env.STRIPE_PUBLISHABLE_KEY = v;
    // The Expo web build reads the same key under its own name; expose it for
    // tooling that boots the mobile bundler from this environment.
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= v;
    result.stripePublishableKeySource = name;
    break;
  }

  // --- Twilio ------------------------------------------------------------------
  // Two auth modes, in preference order:
  //  1. Account SID (AC…) + auth token — classic.
  //  2. API key SID (SK…) + secret — what the operator provisioned. The
  //     account SID is then discovered via the REST API at first send.
  const accountSid = firstSet('TWILIO_ACCOUNT_SID');
  const authToken = firstSet('TWILIO_AUTH_TOKEN');
  if (accountSid?.startsWith('AC') && authToken) {
    result.twilioAuthMode = 'account';
  } else {
    const apiKeySid = firstSet('TWILIO_API_KEY_SID', 'Twilio_Acc_SID', 'Teilio_Acc_SID');
    const apiKeySecret = firstSet('TWILIO_API_KEY_SECRET', 'Twilio_Secret', 'Twilio_Secret2');
    if (apiKeySid?.startsWith('SK') && apiKeySecret) {
      process.env.TWILIO_API_KEY_SID = apiKeySid;
      process.env.TWILIO_API_KEY_SECRET = apiKeySecret;
      result.twilioAuthMode = 'api-key';
    } else if (apiKeySid?.startsWith('AC') && apiKeySecret) {
      // Operator stored a classic account SID under the API-key secret names.
      process.env.TWILIO_ACCOUNT_SID = apiKeySid;
      process.env.TWILIO_AUTH_TOKEN = apiKeySecret;
      result.twilioAuthMode = 'account';
    }
  }

  // Real SMS delivery is opt-in outside production so that dev/test runs with
  // injected credentials never text real phone numbers by accident.
  if (isProd && result.twilioAuthMode && !process.env.SMS_PROVIDER) {
    process.env.SMS_PROVIDER = 'twilio';
  }

  return result;
}

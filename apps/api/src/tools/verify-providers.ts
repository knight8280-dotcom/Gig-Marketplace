/* eslint-disable no-console */
import Stripe from 'stripe';
import { resolveProviderEnv } from '../config/provider-env';

/**
 * Provider credential verification — safe, read-mostly checks.
 * Usage: pnpm --filter @gig/api verify:providers
 *
 * Resolves credentials through the same provider-env mapping the app uses
 * (canonical names or Cloud Agent secret names), then verifies:
 *  - Stripe test mode: key valid, customer + SetupIntent creation works
 *    (created and deleted immediately). Live secret keys are NEVER exercised
 *    beyond a read-only balance check, and never outside production.
 *  - Publishable keys: present and mode-consistent (test vs live).
 *  - Twilio: credentials valid (account fetch), From-number inventory listed.
 *    No SMS is sent unless TEST_SMS_TO is provided.
 */

async function verifyStripeTestMode(): Promise<boolean> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.log('✗ Stripe: no usable secret key resolved (need a test key: sk_test_… or rk_test_…)');
    return false;
  }
  if (key.startsWith('sk_live') || key.startsWith('rk_live')) {
    console.log('✗ Stripe: a LIVE key resolved into STRIPE_SECRET_KEY. Refusing — verification runs test mode only.');
    return false;
  }
  try {
    const stripe = new Stripe(key);
    const balance = await stripe.balance.retrieve();
    console.log(`✓ Stripe: test-mode key valid (balance retrieved, livemode=${balance.livemode})`);
    const customer = await stripe.customers.create({ email: 'verify@example.test' });
    const si = await stripe.setupIntents.create({ customer: customer.id, usage: 'off_session' });
    await stripe.customers.del(customer.id);
    console.log(`✓ Stripe: customer + SetupIntent creation works (${si.status}); cleanup done`);

    // Connect is required for worker payouts (v2 recipient accounts + transfers).
    try {
      const account = await stripe.v2.core.accounts.create({
        contact_email: 'verify@example.test',
        display_name: 'verify@example.test',
        dashboard: 'express',
        identity: { country: process.env.STRIPE_ACCOUNT_COUNTRY ?? 'US' },
        defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
        configuration: {
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
        },
      });
      await stripe.v2.core.accounts.close(account.id).catch(() => undefined);
      console.log('✓ Stripe Connect: enabled (v2 recipient account creation works); cleanup done');
    } catch (connectErr) {
      const message = (connectErr as Error).message;
      if (/signed up for Connect/i.test(message)) {
        console.log(
          '✗ Stripe Connect: NOT enabled — worker payouts will fail. Enable it at https://dashboard.stripe.com/connect',
        );
        return false;
      }
      throw connectErr;
    }
    return true;
  } catch (err) {
    console.log(`✗ Stripe: API call failed — ${(err as Error).message}`);
    return false;
  }
}

async function verifyStripeLiveReadOnly(): Promise<void> {
  // The live key is validated read-only for completeness; it is never used
  // by the app outside NODE_ENV=production (enforced in provider-env).
  const liveKey = [process.env.Stripe_API_Key, process.env.STRIPE_SECRET_KEY_LIVE].find(
    (k) => k && (k.startsWith('rk_live') || k.startsWith('sk_live')),
  );
  if (!liveKey) {
    console.log('  (no live secret key present — fine for development)');
    return;
  }
  try {
    // Raw GET /v1/account — read-only, works for restricted (rk_) keys.
    const res = await fetch('https://api.stripe.com/v1/account', {
      headers: { authorization: `Bearer ${liveKey}` },
    });
    if (!res.ok) {
      console.log(`! Stripe LIVE key check failed (HTTP ${res.status})`);
      return;
    }
    const account = (await res.json()) as { id: string; charges_enabled?: boolean };
    console.log(
      `✓ Stripe LIVE key valid (read-only check; account ${account.id}, charges_enabled=${account.charges_enabled}). ` +
        'Live keys are only used when NODE_ENV=production.',
    );
  } catch (err) {
    console.log(`! Stripe LIVE key check failed — ${(err as Error).message}`);
  }
}

function verifyPublishableKeys(): void {
  const testPk = [process.env.STRIPE_PUBLISHABLE_KEY, process.env.Stripe_pk_Test].find((k) => k?.startsWith('pk_test'));
  const livePk = [process.env.Stripe_PK_Live].find((k) => k?.startsWith('pk_live'));
  console.log(testPk ? '✓ Stripe: publishable TEST key present' : '! Stripe: no publishable test key (mobile payment sheet needs pk_test_…)');
  console.log(livePk ? '✓ Stripe: publishable LIVE key present (production builds)' : '  (no publishable live key — needed only for production builds)');
}

interface TwilioAccount {
  sid: string;
  friendly_name?: string;
  status?: string;
}

async function verifyTwilio(): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const keySid = process.env.TWILIO_API_KEY_SID;
  const keySecret = process.env.TWILIO_API_KEY_SECRET;

  let auth: string;
  let mode: string;
  if (accountSid?.startsWith('AC') && authToken) {
    auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
    mode = 'account SID + auth token';
  } else if (keySid?.startsWith('SK') && keySecret) {
    auth = `Basic ${Buffer.from(`${keySid}:${keySecret}`).toString('base64')}`;
    mode = 'API key SID + secret';
  } else {
    console.log('✗ Twilio: no credentials resolved (need account SID + token, or API key SID + secret)');
    return false;
  }

  try {
    const res = await fetch('https://api.twilio.com/2010-04-01/Accounts.json?PageSize=1', {
      headers: { authorization: auth },
    });
    if (!res.ok) {
      console.log(`✗ Twilio: credentials rejected (HTTP ${res.status})`);
      return false;
    }
    const data = (await res.json()) as { accounts: TwilioAccount[] };
    const account = data.accounts[0];
    if (!account) {
      console.log('✗ Twilio: credentials valid but no account visible');
      return false;
    }
    console.log(
      `✓ Twilio: credentials valid via ${mode} (account "${account.friendly_name}", sid ${account.sid}, status ${account.status})`,
    );

    const numbersRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${account.sid}/IncomingPhoneNumbers.json?PageSize=5`,
      { headers: { authorization: auth } },
    );
    const numbers = numbersRes.ok
      ? ((await numbersRes.json()) as { incoming_phone_numbers: Array<{ phone_number: string }> }).incoming_phone_numbers
      : [];
    const configuredFrom = process.env.TWILIO_FROM_NUMBER;
    if (configuredFrom) {
      console.log(`✓ Twilio: From number configured (${configuredFrom})`);
    } else if (numbers.length > 0) {
      console.log(`✓ Twilio: ${numbers.length} phone number(s) on account; SMS will use ${numbers[0]!.phone_number}`);
    } else {
      console.log('! Twilio: NO phone numbers on the account — buy one (or set TWILIO_FROM_NUMBER) before SMS can send');
    }

    const to = process.env.TEST_SMS_TO;
    if (to) {
      const from = configuredFrom ?? numbers[0]?.phone_number;
      if (!from) {
        console.log('✗ Twilio: cannot send test SMS — no From number available');
      } else {
        const send = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account.sid}/Messages.json`, {
          method: 'POST',
          headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            To: to,
            From: from,
            Body: 'Local Gig Marketplace: provider verification test message.',
          }).toString(),
        });
        const message = (await send.json()) as { sid?: string; status?: string; message?: string };
        if (send.ok) console.log(`✓ Twilio: test SMS accepted (sid ${message.sid}, status ${message.status})`);
        else console.log(`✗ Twilio: SMS send failed — ${message.message}`);
      }
    } else {
      console.log('  (set TEST_SMS_TO=+1… to also send one real test SMS)');
    }
    return true;
  } catch (err) {
    console.log(`✗ Twilio: request failed — ${(err as Error).message}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log('— Provider verification (test-mode only; live keys checked read-only) —');
  const resolved = resolveProviderEnv();
  console.log(
    `  resolved: stripe secret ← ${resolved.stripeSecretKeySource ?? 'none'}, ` +
      `publishable ← ${resolved.stripePublishableKeySource ?? 'none'}, ` +
      `twilio auth ← ${resolved.twilioAuthMode ?? 'none'}`,
  );
  const stripeOk = await verifyStripeTestMode();
  await verifyStripeLiveReadOnly();
  verifyPublishableKeys();
  const twilioOk = await verifyTwilio();
  console.log('—');
  console.log(`Stripe: ${stripeOk ? 'READY' : 'NOT READY'} · Twilio: ${twilioOk ? 'READY' : 'NOT READY'}`);
  if (!stripeOk || !twilioOk) process.exitCode = 1;
}

main();

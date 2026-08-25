/* eslint-disable no-console */
import Stripe from 'stripe';

/**
 * Provider credential verification — safe, read-mostly checks.
 * Usage: pnpm --filter @gig/api verify:providers
 *
 * Verifies:
 *  - Stripe: key present, TEST MODE ONLY (refuses sk_live), API reachable,
 *    can create a SetupIntent-capable customer (created + deleted immediately).
 *  - Twilio: credentials valid via account fetch (no SMS sent unless
 *    TEST_SMS_TO is provided, in which case one real test SMS is sent).
 */
async function verifyStripe(): Promise<boolean> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.log('✗ Stripe: STRIPE_SECRET_KEY is not set');
    return false;
  }
  if (key.startsWith('sk_live')) {
    console.log('✗ Stripe: a LIVE key is configured. Refusing — verification must use test mode (sk_test_…).');
    return false;
  }
  if (!key.startsWith('sk_test')) {
    console.log('✗ Stripe: key does not look like a secret test key (expected sk_test_…)');
    return false;
  }
  try {
    const stripe = new Stripe(key);
    const balance = await stripe.balance.retrieve();
    console.log(`✓ Stripe: test-mode key valid (balance object retrieved, livemode=${balance.livemode})`);
    const customer = await stripe.customers.create({ email: 'verify@example.test' });
    const si = await stripe.setupIntents.create({ customer: customer.id, usage: 'off_session' });
    await stripe.customers.del(customer.id);
    console.log(`✓ Stripe: customer + SetupIntent creation works (${si.status}); cleanup done`);
    const pk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) console.log('! Stripe: EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY not set (mobile payment sheet needs it)');
    else if (!pk.startsWith('pk_test')) console.log('✗ Stripe: publishable key is not a test key (expected pk_test_…)');
    else console.log('✓ Stripe: publishable test key present');
    return true;
  } catch (err) {
    console.log(`✗ Stripe: API call failed — ${(err as Error).message}`);
    return false;
  }
}

async function verifyTwilio(): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    console.log('✗ Twilio: missing env (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)');
    return false;
  }
  if (!sid.startsWith('AC')) {
    console.log('✗ Twilio: TWILIO_ACCOUNT_SID should start with AC…');
    return false;
  }
  const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { authorization: auth },
    });
    if (!res.ok) {
      console.log(`✗ Twilio: credentials rejected (HTTP ${res.status})`);
      return false;
    }
    const account = (await res.json()) as { friendly_name?: string; status?: string };
    console.log(`✓ Twilio: credentials valid (account "${account.friendly_name}", status ${account.status})`);

    const to = process.env.TEST_SMS_TO;
    if (to) {
      const send = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
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
  console.log('— Provider verification (test-mode only; refuses live keys) —');
  const stripeOk = await verifyStripe();
  const twilioOk = await verifyTwilio();
  console.log('—');
  console.log(`Stripe: ${stripeOk ? 'READY' : 'NOT READY'} · Twilio: ${twilioOk ? 'READY' : 'NOT READY'}`);
  if (!stripeOk || !twilioOk) process.exitCode = 1;
}

main();

# @gig/mobile — Expo React Native app

Customer + worker mobile app (Expo SDK 57, expo-router, TanStack Query).

**Status:** core screens implemented and typechecked; **not yet device-tested** —
run through Expo Go against a local API before treating any flow as verified.

## Implemented

- Auth: welcome / register (role choice) / login; secure token storage
  (expo-secure-store) with automatic refresh-token rotation
- Role-aware navigation (dual-role accounts switch modes in Profile):
  - Worker tabs: Home (availability toggle, today's earnings, nearby jobs via GPS),
    Jobs (assignments), Messages, Activity, Profile
  - Customer tabs: Home (post CTA + active jobs), My Jobs, Messages, Activity, Profile
- Post-a-job guided form (categories from the API; job pin uses device location —
  map-pin placement is Coming Soon)
- Job detail with role-aware actions: accept, en-route → arrived → start → complete,
  confirm completion, report a problem (dispute), cancel, 1–5★ rating
- Job-scoped chat (polling), notification center (Activity tab)

## Not yet built (honest gaps)

- Map view (list-only discovery for now)
- Photo upload, saved addresses UI, full worker onboarding screens
  (skills/categories/radius are API-ready; set via API or upcoming screens)
- Stripe payment-method entry and Connect onboarding UI (requires
  @stripe/stripe-react-native + test keys)
- Expo push notifications (in-app Activity feed works; device push pending)

## Run

```bash
pnpm install
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000 pnpm start   # scan with Expo Go
```

The backend must be running (see docs/development/LOCAL_SETUP.md).

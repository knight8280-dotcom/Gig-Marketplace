/**
 * Side-effect module: normalizes provider credentials into canonical env vars.
 * MUST be imported before AppModule so that provider selection (which reads
 * process.env at module-decoration time) sees the resolved values.
 */
import { resolveProviderEnv } from './provider-env';

resolveProviderEnv();

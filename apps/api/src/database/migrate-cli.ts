import { join } from 'node:path';
import { loadConfig } from '../config/config';
import { runMigrations } from './migrator';

async function main(): Promise<void> {
  const config = loadConfig();
  const applied = await runMigrations(config.databaseUrl, join(__dirname, '..', '..', 'migrations'));
  // eslint-disable-next-line no-console
  console.log(
    applied.length > 0 ? `Applied migrations:\n${applied.join('\n')}` : 'No pending migrations.',
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

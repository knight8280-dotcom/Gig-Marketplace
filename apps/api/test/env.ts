// Test environment — always the dedicated test database, never dev/prod.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://gig:gig_dev_password@localhost:5432/gig_test';
process.env.JWT_ACCESS_SECRET = 'test_secret_do_not_use_anywhere_else';

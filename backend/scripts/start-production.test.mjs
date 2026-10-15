import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startProduction } from './start-production.mjs';

test('production applies pending migrations before accepting writes, without seeds or resets', async () => {
  const order = [];
  await startProduction({ env: { DATABASE_URL: 'postgresql://localhost/test', DIRECT_URL: 'postgresql://localhost/direct' },
    migrate: (_node, args, options) => {
      order.push('migrate');
      assert.deepEqual(args.slice(1, 3), ['migrate', 'deploy']);
      assert.equal(options.env.DIRECT_URL, 'postgresql://localhost/direct');
      assert.equal(options.shell, false);
      return { status: 0 };
    }, start: async () => { order.push('listen'); },
  });
  assert.deepEqual(order, ['migrate', 'listen']);
});

test('plain database URL works without a separate direct URL', async () => {
  await startProduction({ env: { DATABASE_URL: 'postgresql://localhost/test' },
    migrate: (_node, _args, options) => {
      assert.equal(options.env.DIRECT_URL, options.env.DATABASE_URL);
      return { status: 0 };
    }, start: async () => {},
  });
});

test('migration failure or missing configuration never starts an incompatible API', async () => {
  let started = false;
  const start = async () => { started = true; };
  await assert.rejects(startProduction({ env: { DATABASE_URL: 'postgresql://localhost/test' }, migrate: () => ({ status: 1 }), start }), /migrations failed/);
  await assert.rejects(startProduction({ env: {}, migrate: () => { throw new Error('must not run'); }, start }), /DATABASE_URL/);
  assert.equal(started, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHarnessOptions } from '../src/harness/config.ts';

test('harness configuration rejects invalid modes, unknown points and unusable fixed routes', () => {
  assert.deepEqual(validateHarnessOptions({ mode: 'off' }), { mode: 'off' });
  assert.throws(() => validateHarnessOptions({ mode: 'maybe' }));
  assert.throws(() => validateHarnessOptions({ monitorEvery: 0 }));
  assert.throws(() => validateHarnessOptions({ modes: { 'context.typo': 'active' } }), /Unknown decision/);
  assert.throws(() => validateHarnessOptions({ fixedModel: 'missing' }), /fixedModel/);
  assert.throws(() => validateHarnessOptions({ boardWriter: {} }));
});

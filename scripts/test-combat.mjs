/**
 * Quick sanity checks for combat math (no browser).
 * Run: node scripts/test-combat.mjs
 */

function hpLossFromDamage(amount, t1, t2) {
  const r = Math.max(0, Number(amount) || 0);
  if (r === 0) return 0;
  if (r <= t1) return 1;
  if (r <= t2) return 2;
  return 3;
}

function stripHitsFromDamage(amount, t1, t2) {
  const r = Math.max(0, Number(amount) || 0);
  if (r === 0) return 0;
  if (r <= t1) return 1;
  if (r <= t2) return 1;
  return 2;
}

function mitigationFor(amount, blocked) {
  return blocked
    ? Math.max(0, Number(amount || 0) - 1)
    : Math.max(0, Number(amount || 0));
}

const t1 = 7;
const t2 = 14;
let passed = 0;
let failed = 0;

function assert(label, cond) {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.error(` FAIL ${label}`);
  }
}

console.log('Combat math checks\n');

assert('light HP loss', hpLossFromDamage(5, t1, t2) === 1);
assert('heavy HP loss', hpLossFromDamage(10, t1, t2) === 2);
assert('brutal HP loss', hpLossFromDamage(20, t1, t2) === 3);
assert('brutal strip hits', stripHitsFromDamage(20, t1, t2) === 2);
assert('light strip hits', stripHitsFromDamage(3, t1, t2) === 1);
assert('armor block reduces damage', mitigationFor(10, true) === 9);
assert('no block unchanged', mitigationFor(10, false) === 10);
assert(
  'blocked brutal can drop tier',
  hpLossFromDamage(mitigationFor(15, true), t1, t2) === 2
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

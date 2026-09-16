import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, formatMoney, roundRatio, percentage, invoiceTotals, businessAllocation } from '../src/domain/money.ts';
import { quarterForDate, dueDate } from '../src/domain/dates.ts';

test('exacte invoer, ook boven Number.MAX_SAFE_INTEGER', () => {
  assert.equal(parseMoney('19,01'), 1901n);
  assert.equal(parseMoney('-0.01'), -1n);
  assert.equal(parseMoney('9007199254740993.01'), 900719925474099301n);
  assert.equal(formatMoney(900719925474099301n), '€ 9.007.199.254.740.993,01');
  for (const value of ['1e2', 'NaN', '1.001', '1,000.00', '', ' 1', '01', '--1']) {
    assert.throws(() => parseMoney(value));
  }
});
test('afronding inclusief positieve en negatieve halve cent', () => {
  assert.equal(roundRatio(20124n, 10n), 2012n);
  assert.equal(roundRatio(20125n, 10n), 2013n);
  assert.equal(roundRatio(-20125n, 10n), -2013n);
  assert.equal(roundRatio(1n, 3n), 0n);
  assert.equal(roundRatio(2n, 3n), 1n);
  assert.throws(() => roundRatio(1n, 0n));
  assert.throws(() => percentage(100n, 10001n));
});
test('verkoopfixture: 100 + 21 = 121 en credit is exact tegengesteld', () => {
  for (const sign of [1n, -1n]) {
    const result = invoiceTotals([{ net: sign * 10000n, vatBasisPoints: 2100n }]);
    assert.equal(result.vat, sign * 2100n);
    assert.equal(result.gross, sign * 12100n);
  }
  const lines = invoiceTotals([{ net: 3n, vatBasisPoints: 2100n }, { net: 3n, vatBasisPoints: 2100n }]);
  assert.equal(lines.vat, 2n); // per prestatie; niet opnieuw over totaal afronden
  assert.throws(() => invoiceTotals([]));
});
test('85% zakelijke software: kosten 16,16, btw 3,39, privé 3,45', () => {
  assert.deepEqual(businessAllocation(1901n, 399n, 8500n, 10000n), {
    businessNet: 1616n, deductibleVat: 339n, nonDeductibleBusinessVat: 0n,
    businessCost: 1616n, privatePart: 345n, total: 2300n,
  });
  const noDeduction = businessAllocation(1901n, 399n, 8500n, 0n);
  assert.equal(noDeduction.businessCost, 1955n);
  assert.equal(noDeduction.deductibleVat, 0n);
});
test('alle percentages en centgrenzen behouden het totaal', () => {
  for (let net = 0n; net < 300n; net++) {
    for (let bps = 0n; bps <= 10000n; bps += 100n) {
      const vat = percentage(net, 2100n);
      const split = businessAllocation(net, vat, bps, 5000n);
      assert.equal(split.businessCost + split.deductibleVat + split.privatePart, net + vat);
      assert.equal(percentage(-net, bps), -percentage(net, bps));
    }
  }
});
test('kalenderdatum bepaalt kwartaal, onafhankelijk van betaling of zomertijd', () => {
  assert.equal(quarterForDate('2026-06-30'), '2026-Q2');
  assert.equal(quarterForDate('2026-07-01'), '2026-Q3');
  assert.equal(dueDate('2026-12-25', 14), '2027-01-08');
  assert.equal(dueDate('2026-10-20', 14), '2026-11-03');
  assert.throws(() => quarterForDate('2026-02-29'));
  assert.throws(() => dueDate('2026-01-01', 1.5));
});

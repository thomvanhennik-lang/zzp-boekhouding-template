/** Exacte centen. JSON gebruikt decimale strings; nooit Number voor geld. */
export function parseMoney(value: string): bigint {
  if (!/^-?(0|[1-9]\d*)([.,]\d{1,2})?$/.test(value)) {
    throw new Error('Vul een bedrag in met maximaal twee decimalen, zonder duizendtallen.');
  }
  const negative = value.startsWith('-');
  const [whole, decimals = ''] = value.replace('-', '').replace(',', '.').split('.');
  const cents = BigInt(whole) * 100n + BigInt(decimals.padEnd(2, '0'));
  return negative ? -cents : cents;
}

/** Halve cent van nul af; bij credits exact de tegengestelde uitkomst. */
export function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('De deler moet positief zijn.');
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator * sign;
  return sign * ((absolute + denominator / 2n) / denominator);
}

export function percentage(cents: bigint, basisPoints: bigint): bigint {
  if (basisPoints < 0n || basisPoints > 10_000n) throw new Error('Percentage buiten 0–100%.');
  return roundRatio(cents * basisPoints, 10_000n);
}

export function formatMoney(cents: bigint): string {
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '−' : ''}€ ${(absolute / 100n).toLocaleString('nl-NL')},${(absolute % 100n).toString().padStart(2, '0')}`;
}

export function invoiceTotals(lines: readonly { net: bigint; vatBasisPoints: bigint }[]) {
  if (!lines.length) throw new Error('Voeg minstens één factuurregel toe.');
  const calculated = lines.map(line => ({ ...line, vat: percentage(line.net, line.vatBasisPoints) }));
  const net = calculated.reduce((sum, line) => sum + line.net, 0n);
  const vat = calculated.reduce((sum, line) => sum + line.vat, 0n);
  return { lines: calculated, net, vat, gross: net + vat, roundingPolicy: 'line-half-away-v1' as const };
}

/** Rekenkundige verdeling; fiscale aftrekbaarheid moet apart worden bevestigd. */
export function businessAllocation(net: bigint, vat: bigint, businessBps: bigint, vatDeductionBps: bigint) {
  if (net < 0n || vat < 0n) throw new Error('Gebruik voor creditnota’s een afzonderlijke correctieflow.');
  const businessNet = percentage(net, businessBps);
  const businessVat = percentage(vat, businessBps);
  const deductibleVat = percentage(businessVat, vatDeductionBps);
  return {
    businessNet,
    deductibleVat,
    nonDeductibleBusinessVat: businessVat - deductibleVat,
    businessCost: businessNet + businessVat - deductibleVat,
    privatePart: net + vat - businessNet - businessVat,
    total: net + vat,
  };
}

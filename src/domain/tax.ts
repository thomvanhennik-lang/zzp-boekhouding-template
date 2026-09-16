import { roundRatio } from './money.ts';
const max=(a:bigint,b:bigint)=>a>b?a:b;
const min=(a:bigint,b:bigint)=>a<b?a:b;
const rate=(amount:bigint,numerator:bigint)=>roundRatio(amount*numerator,100000n);
export const taxSources={
  box1:'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/boxen_en_tarieven/box_1/box_1',
  general:'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/heffingskortingen/algemene_heffingskorting/tabel-algemene-heffingskorting-2026',
  labour:'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/heffingskortingen/arbeidskorting/tabel-arbeidskorting-2026',
  zvw:'https://www.belastingdienst.nl/wps/wcm/connect/fisin/fisin2026/inkomensafhankelijke_bijdrage_zorgverzekeringswet',
  mkb:'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/inkomstenbelasting/veranderingen-inkomstenbelasting-2026/mkb-winstvrijstelling-2026',
};
export function grossTax2026(income:bigint) {const n=max(0n,income);return rate(min(n,3888300n),35750n)+rate(min(max(n-3888300n,0n),3954300n),37560n)+rate(max(n-7842600n,0n),49500n);}
export function generalCredit2026(income:bigint) {if(income>7842600n)return 0n;return max(0n,311500n-rate(max(0n,income-2973600n),6398n));}
export function labourCredit2026(income:bigint) {const n=max(0n,income);if(n<=1196500n)return rate(n,8324n);if(n<=2584500n)return 99600n+rate(n-1196500n,31009n);if(n<=4559200n)return 530000n+rate(n-2584500n,1950n);if(n<=13292000n)return max(0n,568500n-rate(n-4559200n,6510n));return 0n;}
/** Testscenario: onder AOW, volledig NL verzekerd, alleen zakelijke winst, geen privéaftrek/box 2/3. */
export function taxScenario2026(profit:bigint,entrepreneur:boolean) {
  const positive=max(profit,0n),exemption=entrepreneur?rate(positive,12700n):0n,taxable=positive-exemption;
  const gross=grossTax2026(taxable);
  // Aftrekbeperking: het deel van de vrijstelling dat anders de derde schijf reduceert.
  const limitation=rate(min(exemption,max(0n,positive-7842600n)),11940n);
  const general=generalCredit2026(taxable),labour=labourCredit2026(positive);
  const incomeTax=max(0n,gross+limitation-general-labour),zvw=rate(min(taxable,7940900n),4850n);
  return {version:'2026-sandbox-v1',profit,exemption,taxable,gross,limitation,general,labour,incomeTax,zvw,total:incomeTax+zvw,status:'provisional' as const};
}

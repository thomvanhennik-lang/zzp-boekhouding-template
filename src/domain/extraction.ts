export type Proposal={engine:string;at:string;fields:Record<string,{value:string;confidence:number;source:string}>;warnings:string[]};
/** Conservative text heuristics; never authorizes or posts a document. */
export function proposeFields(text:string):Proposal {
 const fields:Proposal['fields']={},warnings:string[]=[];
 const patterns:Record<string,RegExp>={net:/(?:excl\.?\s*(?:btw|vat)|netto|subtotal|subtotaal)\s*[:\s]*(?:EUR|€)?\s*(\d+[.,]\d{2})/i,vat:/(?:BTW|VAT|tax)(?:\s*21\s*%)?\s*[:\s]*(?:EUR|€)?\s*(\d+[.,]\d{2})/i,gross:/\b(?:totaal|total)(?:\s*(?:incl\.?\s*btw|amount))?\s*[:\s]*(?:EUR|€)?\s*(\d+[.,]\d{2})/i,supplierNumber:/(?:factuurnummer|invoice\s*(?:number|no\.?))\s*[:#]?\s*([A-Z0-9][A-Z0-9/-]{2,30})/i,date:/(?:factuurdatum|invoice\s*date)\s*[:\s]*(\d{4}-\d{2}-\d{2})/i};
 for(const [key,pattern]of Object.entries(patterns)){const match=text.match(pattern);if(match)fields[key]={value:match[1].replace(',','.'),confidence:.7,source:match[0]};else warnings.push(`Niet betrouwbaar herkend: ${key}`);}
 warnings.push('Leverancier, land, zakelijk gebruik en btw-behandeling altijd handmatig controleren.');
 if(!text.trim())warnings.push('Deze pdf heeft geen leesbare tekstlaag. Voer de velden handmatig in of gebruik later OCR.');
 return {engine:'pdf-text-heuristics-v1',at:new Date().toISOString(),fields,warnings};
}

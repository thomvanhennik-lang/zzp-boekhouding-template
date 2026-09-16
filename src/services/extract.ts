import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {SourceDocument} from '../domain/accounting.ts';
import {base64ToBytes} from './local.ts';
import {proposeFields} from '../domain/extraction.ts';
GlobalWorkerOptions.workerSrc=workerUrl;
export async function extractPdf(document:SourceDocument) {
 if(document.type!=='application/pdf')throw new Error('Foto-OCR is nog niet gekoppeld. De originele foto kan wel handmatig worden verwerkt.');
 const task=getDocument({data:base64ToBytes(document.base64),useSystemFonts:true});
 try{const pdf=await task.promise;if(pdf.numPages>30)throw new Error('Controleer documenten met meer dan 30 pagina’s handmatig.');let text='';for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);const content=await page.getTextContent();text+=content.items.map(item=>'str'in item?item.str:'').join(' ')+'\n';}return proposeFields(text);}finally{await task.destroy();}
}

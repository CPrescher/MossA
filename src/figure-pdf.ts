let fonts:Promise<string[]>|undefined;
function pdfFonts(){return fonts??=Promise.all(['LiberationSans-Regular.ttf','LiberationSans-Bold.ttf','NotoSans-Regular.ttf','NotoSans-Bold.ttf'].map(async name=>{const response=await fetch(new URL(`fonts/${name}`,document.baseURI).href);if(!response.ok)throw new Error('Could not load the bundled PDF font.');const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);})).catch(error=>{fonts=undefined;throw error;});}

/** Convert the exact preview SVG to a vector PDF at the chosen physical size. */
export async function figurePdf(svg:string,width:number,height:number):Promise<Blob> {
 return figuresPdf([svg],width,height);
}

/** Shared vector conversion for figures and paginated fit reports. */
export async function figuresPdf(pages:string[],width:number,height:number):Promise<Blob> {
 if(!pages.length)throw new Error('There are no pages to export.');
 const [{jsPDF},{svg2pdf}]=await Promise.all([import('jspdf'),import('svg2pdf.js')]);
 const pdf=new jsPDF({orientation:width>height?'landscape':'portrait',unit:'mm',format:[width,height],compress:true});
 const [regular,bold,fallback,fallbackBold]=await pdfFonts();
 pdf.addFileToVFS('MossASans-Regular.ttf',regular);pdf.addFont('MossASans-Regular.ttf','MossASans','normal');
 pdf.addFileToVFS('MossASans-Bold.ttf',bold);pdf.addFont('MossASans-Bold.ttf','MossASans','bold');
 pdf.addFileToVFS('NotoSans-Regular.ttf',fallback);pdf.addFont('NotoSans-Regular.ttf','MossAFallback','normal');
 pdf.addFileToVFS('NotoSans-Bold.ttf',fallbackBold);pdf.addFont('NotoSans-Bold.ttf','MossAFallback','bold');
 for(const [index,svg] of pages.entries()) {
 if(index)pdf.addPage([width,height],width>height?'landscape':'portrait');
 const element=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
 element.querySelectorAll('[font-weight]').forEach(node=>{const weight=node.getAttribute('font-weight')!;if(Number(weight)>=600)node.setAttribute('font-weight','bold');});
 element.querySelectorAll('text,tspan').forEach(node=>{if(/[⁰⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]/u.test(node.textContent??''))node.setAttribute('data-pdf-fallback','true');});
 element.querySelectorAll('[font-family]').forEach(node=>node.setAttribute('font-family','MossASans'));
 element.querySelectorAll('[data-pdf-fallback]').forEach(node=>node.setAttribute('font-family','MossAFallback'));
 if(!index)pdf.setProperties({title:element.querySelector('title')?.textContent??'Mössbauer spectrum',creator:'MossA'});
 await svg2pdf(element,pdf,{x:0,y:0,width,height,loadExternalStyleSheets:false,loadImages:false});
 }
 return pdf.output('blob');
}

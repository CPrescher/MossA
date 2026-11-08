export function safeFilenamePart(value:string,limit=200) {
 const clean=value.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\.(dat|txt|csv|asc|mca|mossa|json|svg|png)$/i,'').trim();
 let result='';for(const char of clean){if(new TextEncoder().encode(result+char).length>limit)break;result+=char;}return result.replace(/[. ]+$/,'');
}
export function exportFilename(spectrum:string,model:string,output:'spectrum'|'parameters') {
 const name=[safeFilenamePart(spectrum,100),safeFilenamePart(model,100)].filter(Boolean).join(' - ')||'mossa';
 return `${name} - ${output}.csv`;
}

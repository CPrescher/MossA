import svgpath from 'svgpath';
import * as opentype from 'opentype.js';
import type {Font} from 'opentype.js';

type RGB = [number, number, number];
type Point = [number, number];
const number = (v:number) => {
  if (!Number.isFinite(v)) throw new Error('The EPS figure contains an invalid coordinate.');
  return String(Number(v.toFixed(6)));
};
const numbers = (values:number[]) => values.map(number).join(' ');
const attribute = (node:Element, name:string, fallback:string):string => node.getAttribute(name) ?? (node.parentElement ? attribute(node.parentElement,name,fallback) : fallback);
const value = (node:Element, name:string, fallback=0) => Number(node.getAttribute(name) ?? fallback);
function rgb(color:string):RGB {
  if (color === 'white') return [1,1,1];
  if (color === 'black') return [0,0,0];
  if (!/^#[\da-f]{3}([\da-f]{3})?$/i.test(color)) throw new Error(`Unsupported EPS color: ${color}`);
  const hex=color.length===4?color.slice(1).split('').map(c=>c+c).join(''):color.slice(1);
  return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255) as RGB;
}
const blend = (under:RGB, over:RGB, alpha:number):RGB => under.map((v,i)=>v*(1-alpha)+over[i]*alpha) as RGB;

/** Convert SVG path commands, including font quadratic curves, into PostScript. */
function pathCommands(data:string):string {
  const path=svgpath(data).unshort().unarc().abs();
  if ((path as typeof path & {err:string}).err) throw new Error('Could not read an EPS figure path.');
  const lines:string[]=['newpath'];
  path.iterate((s,_index,x,y)=>{
    switch(s[0]) {
      case 'M': lines.push(`${numbers(s.slice(1) as number[])} moveto`);break;
      case 'L': lines.push(`${numbers(s.slice(1) as number[])} lineto`);break;
      case 'H': lines.push(`${numbers([s[1],y])} lineto`);break;
      case 'V': lines.push(`${numbers([x,s[1]])} lineto`);break;
      case 'C': lines.push(`${numbers(s.slice(1) as number[])} curveto`);break;
      case 'Q': lines.push(`${numbers([x+2/3*(s[1]-x),y+2/3*(s[2]-y),s[3]+2/3*(s[1]-s[3]),s[4]+2/3*(s[2]-s[4]),s[3],s[4]])} curveto`);break;
      case 'Z': case 'z': lines.push('closepath');break;
      default: throw new Error('Unsupported EPS path command.');
    }
  });
  return lines.join('\n');
}

let fonts:Promise<Font[]>|undefined;
function epsFonts():Promise<Font[]> {
  return fonts??=Promise.all(['LiberationSans-Regular.ttf','LiberationSans-Bold.ttf','NotoSans-Regular.ttf','NotoSans-Bold.ttf'].map(async name=>{
    const response=await fetch(new URL(`fonts/${name}`,document.baseURI).href);
    if (!response.ok) throw new Error('Could not load the bundled EPS font.');
    const fontApi=(Reflect.get(opentype,'default')??opentype) as typeof opentype;
    return fontApi.parse(await response.arrayBuffer());
  })).catch(error=>{fonts=undefined;throw error;});
}

/** EPS has no alpha channel. Split the site's piecewise-linear areas at every
 * boundary crossing, then composite each region in drawing order on white.
 * This keeps both overlapping transparent fills and all artwork vector-based. */
function flattenedSiteFills(nodes:Element[]):string {
  const layers=nodes.map(node=>{
    const points:Point[]=[];
    svgpath(node.getAttribute('d')!).abs().iterate(s=>{
      if(s[0]==='M'||s[0]==='L')points.push([s[1],s[2]]);
      else if(s[0]!=='Z'&&s[0]!=='z')throw new Error('Unsupported transparent EPS site path.');
    });
    return {points,color:rgb(node.getAttribute('fill')!),alpha:value(node,'fill-opacity',1)};
  });
  const count=layers[0].points.length/2, regions=new Map<string,string[]>();
  if(!Number.isInteger(count)||layers.some(l=>l.points.length!==count*2))throw new Error('Incompatible EPS site paths.');
  for(let i=0;i<count-1;i++) {
    const left=layers[0].points[i][0],right=layers[0].points[i+1][0];
    if(right===left)continue;
    const edges=layers.flatMap(l=>[[l.points[i][1],l.points[i+1][1]],[l.points[2*count-1-i][1],l.points[2*count-2-i][1]]]);
    const at=(edge:number[],t:number)=>edge[0]+t*(edge[1]-edge[0]);
    const cuts=[0,1];
    for(let a=0;a<edges.length;a++)for(let b=a+1;b<edges.length;b++) {
      const start=edges[a][0]-edges[b][0],end=edges[a][1]-edges[b][1];
      if(start*end<0)cuts.push(start/(start-end));
    }
    const sorted=[...new Set(cuts)].sort((a,b)=>a-b);
    for(let k=1;k<sorted.length;k++) {
      const t0=sorted[k-1],t1=sorted[k],mid=(t0+t1)/2;
      const ordered=edges.slice().sort((a,b)=>at(a,mid)-at(b,mid));
      for(let j=1;j<ordered.length;j++) {
        const top=ordered[j-1],bottom=ordered[j],y=(at(top,mid)+at(bottom,mid))/2;
        if(at(bottom,mid)-at(top,mid)<1e-9)continue;
        let color:RGB=[1,1,1],paint=false;
        layers.forEach((layer,index)=>{
          const a=at(edges[index*2],mid),b=at(edges[index*2+1],mid);
          if(y>Math.min(a,b)&&y<Math.max(a,b)&&layer.alpha>0){color=blend(color,layer.color,layer.alpha);paint=true;}
        });
        if(!paint)continue;
        const x0=left+t0*(right-left),x1=left+t1*(right-left);
        const ink=numbers(color),paths=regions.get(ink)??[];
        paths.push(`${numbers([x0,at(top,t0)])} moveto ${numbers([x1,at(top,t1)])} lineto ${numbers([x1,at(bottom,t1)])} lineto ${numbers([x0,at(bottom,t0)])} lineto closepath`);
        regions.set(ink,paths);
      }
    }
  }
  // Paint each color as one compound region. Filling strips separately leaves
  // hairline seams in readers that antialias each fill independently.
  return '% Flattened transparent site fills\n'+Array.from(regions,([color,paths])=>`${color} setrgbcolor\nnewpath\n${paths.join('\n')}\nfill`).join('\n');
}

/** Export the figure renderer's SVG subset at its exact physical size. Text is
 * outlined with bundled fonts so EPS readers need no installed fonts. */
export async function figureEps(svg:string,width:number,height:number):Promise<Blob> {
  const fontList=await epsFonts();
  const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
  const box=root.getAttribute('viewBox')!.split(/\s+/).map(Number);
  const widthPt=width/25.4*72,heightPt=height/25.4*72;
  const output=[`%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: MossA\n%%BoundingBox: 0 0 ${Math.ceil(widthPt)} ${Math.ceil(heightPt)}\n%%HiResBoundingBox: 0 0 ${numbers([widthPt,heightPt])}\n%%LanguageLevel: 2\n%%Pages: 1\n%%EndComments\n%%Page: 1 1\ngsave\n0 ${number(heightPt)} translate\n${numbers([widthPt/box[2],-heightPt/box[3]])} scale\n${numbers([-box[0],-box[1]])} translate`];
  function draw(node:Element) {
    const tag=node.localName;
    if(['defs','title','desc','metadata'].includes(tag))return;
    output.push('gsave');
    const transform=node.getAttribute('transform');
    if(transform) {
      const points:Point[]=[];
      svgpath('M0 0L1 0L0 1').transform(transform).abs().iterate(s=>{if(s[0]==='M'||s[0]==='L')points.push([s[1],s[2]]);});
      const [o,x,y]=points;
      output.push(`[${numbers([x[0]-o[0],x[1]-o[1],y[0]-o[0],y[1]-o[1],o[0],o[1]])}] concat`);
    }
    if(tag==='svg'&&node!==root) {
      const [x,y,w,h]=node.getAttribute('viewBox')!.split(/\s+/).map(Number);
      const vw=value(node,'width'),vh=value(node,'height'),scale=Math.min(vw/w,vh/h);
      output.push(`${numbers([value(node,'x')+(vw-w*scale)/2,value(node,'y')+(vh-h*scale)/2])} translate\n${numbers([scale,scale])} scale\n${numbers([-x,-y])} translate`);
    }
    const clip=node.getAttribute('clip-path');
    if(clip) {
      const id=/^url\(#([\w-]+)\)$/.exec(clip)?.[1];
      const rect=id?root.ownerDocument.getElementById(id)?.querySelector('rect'):null;
      if(!rect)throw new Error('Unsupported EPS clipping region.');
      output.push(`${numbers([value(rect,'x'),value(rect,'y'),value(rect,'width'),value(rect,'height')])} rectclip`);
    }
    if(tag==='g'||tag==='svg') {
      const fills=Array.from(node.children).filter(child=>child.hasAttribute('data-site-fill'));
      const flatten=fills.some(child=>value(child,'fill-opacity',1)<1);
      for(const child of Array.from(node.children)) {
        if(flatten&&fills.includes(child)){if(child===fills[0])output.push(flattenedSiteFills(fills));}
        else draw(child);
      }
    } else {
      let path:string;
      switch(tag) {
        case 'path':path=pathCommands(node.getAttribute('d')??'');break;
        case 'rect': {
          const x=value(node,'x'),y=value(node,'y'),w=value(node,'width'),h=value(node,'height');
          path=`newpath ${numbers([x,y])} moveto ${numbers([x+w,y])} lineto ${numbers([x+w,y+h])} lineto ${numbers([x,y+h])} lineto closepath`;break;
        }
        case 'circle':path=`newpath ${numbers([value(node,'cx'),value(node,'cy'),value(node,'r'),0,360])} arc closepath`;break;
        case 'line':path=`newpath ${numbers([value(node,'x1'),value(node,'y1')])} moveto ${numbers([value(node,'x2'),value(node,'y2')])} lineto`;break;
        case 'text': {
          const text=(node.textContent??'').normalize('NFC'),size=Number(attribute(node,'font-size','12')),bold=/^(bold|[6-9]00)$/.test(attribute(node,'font-weight','normal'));
          const primary=fontList[bold?1:0],fallback=fontList[bold?3:2];
          const font=[...text].every(c=>primary.hasChar(c))?primary:fallback;
          if([...text].some(c=>!font.hasChar(c)))throw new Error('An EPS label contains a character unavailable in the bundled fonts. Use a LaTeX label or export SVG instead.');
          // Outline glyphs directly: these bundled fonts contain scientific
          // Unicode symbols whose optional shaping tables are not all supported.
          const glyphs=[...text].map(c=>font.charToGlyph(c));
          let natural=0;
          const outlines=glyphs.map((glyph,index)=>{
            const outline=glyph.getPath(natural,0,size,undefined,font).toPathData(6);
            natural+=((glyph.advanceWidth??0)+(index+1<glyphs.length?font.getKerningValue(glyph,glyphs[index+1]):0))*size/font.unitsPerEm;
            return outline;
          });
          const length=value(node,'textLength',natural),anchor=attribute(node,'text-anchor','start');
          output.push(`${numbers([value(node,'x')-(anchor==='middle'?length/2:anchor==='end'?length:0),value(node,'y')])} translate\n${numbers([natural?length/natural:1,1])} scale`);
          path=pathCommands(outlines.join(''));break;
        }
        default:throw new Error(`Unsupported EPS figure element: ${tag}`);
      }
      const color=attribute(node,'color','#000000');
      const paint=(kind:'fill'|'stroke')=>{
        const ink=attribute(node,kind,kind==='fill'?'#000000':'none');
        const alpha=Number(attribute(node,`${kind}-opacity`,'1'));
        if(ink==='none'||alpha===0||(kind==='stroke'&&Number(attribute(node,'stroke-width','1'))===0))return;
        output.push(`gsave\n${numbers(blend([1,1,1],rgb(ink==='currentColor'?color:ink),alpha))} setrgbcolor`);
        if(kind==='stroke') {
          const dash=attribute(node,'stroke-dasharray','none');
          output.push(`${attribute(node,'stroke-width','1')} setlinewidth\n${{round:1,bevel:2}[attribute(node,'stroke-linejoin','miter')]??0} setlinejoin\n${{round:1,square:2}[attribute(node,'stroke-linecap','butt')]??0} setlinecap\n[${dash==='none'?'':numbers(dash.split(/[ ,]+/).map(Number))}] 0 setdash`);
        }
        output.push(path,kind==='fill'&&attribute(node,'fill-rule','nonzero')==='evenodd'?'eofill':kind,'grestore');
      };
      if(tag!=='line')paint('fill');
      paint('stroke');
    }
    output.push('grestore');
  }
  draw(root);
  output.push('grestore\nshowpage\n%%Trailer\n%%EOF\n');
  return new Blob([output.join('\n')],{type:'application/postscript'});
}

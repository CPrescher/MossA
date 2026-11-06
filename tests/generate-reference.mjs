// Independent JavaScript transcription of the literal MATLAB profile expressions.
// These fixtures are NOT outputs of a MATLAB runtime. See reference/export_mossa_reference.m.
import { mkdirSync, writeFileSync } from 'node:fs';
const x = [-8,-5.1,-2.4,-.6,0,.23,.9,1.7,4.3,5.1,8];
const line = (shape,x,c,a) => {
  const h=.42/2, z=(x-c)/h;
  const l=a/(Math.PI*h*(1+z*z));
  const g=a*.8326/(h*1.7725)*Math.exp(-(((x-c)/(h/.8326))**2));
  return shape==='Gaussian'?g:shape==='PseudoVoigt'?.3*l+.7*g:shape==='LorSquared'?a*h*2*Math.PI*(1/(Math.PI*h*(1+z*z)))**2:l;
};
const cases=[];
for (const kind of ['Singlet','Doublet','Sextet']) for(const profile of ['Lorentzian','Gaussian','PseudoVoigt','LorSquared']) {
  const absorption=x.map(v=>{
    if(kind==='Singlet')return line(profile,v,.23,400);
    if(kind==='Doublet')return line(profile,v,.23-.9,.37*400)+line(profile,v,.23+.9,.63*400);
    const a=400*3/(6+6*(1/1.6+1/3.2));
    return [[-.1613,.9,1],[-.0934,-.9,1/1.6],[-.0255,-.9,1/3.2],[.0255,-.9,1/3.2],[.0934,-.9,1/1.6],[.1613,.9,1]].reduce((s,[k,q,w])=>s+line(profile,v,.23+31.2*k+q,a*w),0);
  });cases.push({kind,profile,absorption});
}
mkdirSync(new URL('./fixtures',import.meta.url),{recursive:true});
writeFileSync(new URL('./fixtures/reference-profiles.json',import.meta.url),JSON.stringify({ provenance:'Independent transcription of original MATLAB expressions; not executed in MATLAB', reference_commit:'d201482b7990afbd0e2dcc23e306bfc8d60a5049',x,cases},null,2)+'\n');

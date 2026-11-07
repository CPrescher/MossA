import {scientificLabel} from './scientific-label';

const greek:Record<string,string>={alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ε',theta:'θ',lambda:'λ',mu:'μ',nu:'ν',pi:'π',rho:'ρ',sigma:'σ',tau:'τ',phi:'φ',chi:'χ',psi:'ψ',omega:'ω',Gamma:'Γ',Delta:'Δ',Theta:'Θ',Lambda:'Λ',Sigma:'Σ',Phi:'Φ',Psi:'Ψ',Omega:'Ω'};
const superscript:Record<string,string>=Object.fromEntries([...'0123456789+-=()in'].map((c,i)=>[c,[...'⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁱⁿ'][i]]));
const subscript:Record<string,string>=Object.fromEntries([...'0123456789+-=()aehijklmnoprstuvx'].map((c,i)=>[c,[...'₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ'][i]]));

/** Text for native options and accessible names; original TeX stays editable/saved. */
export function plainScientificLabel(source:string):string {
  const parsed=scientificLabel(source);
  if(parsed.error)return source;
  return parsed.parts.map(part=>{
    if(part.kind==='text')return part.source;
    let text=part.source;
    for(let i=0;i<8;i++) {
      const previous=text;
      text=text.replace(/\\(?:mathrm|mathbf|mathit|mathsf|mathtt|text|operatorname)\{([^{}]*)\}/g,'$1')
        .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g,'($1)/($2)')
        .replace(/\\sqrt\{([^{}]*)\}/g,'√($1)');
      if(text===previous)break;
    }
    text=text.replace(/\\([a-zA-Z]+)/g,(whole,command)=>greek[command]??({times:'×',cdot:'·',pm:'±',mp:'∓',infty:'∞'} as Record<string,string>)[command]??whole)
      .replace(/\\(?:[,;! ]|quad\b|qquad\b)/g,' ');
    // Unknown notation retains its source rather than silently losing meaning.
    if(/\\[a-zA-Z]+/.test(text))return part.source;
    for(let i=0;i<8;i++) {
      const previous=text;
      text=text.replace(/([_^])(?:\{([^{}]*)\}|([^{}()_^]))/g,(_whole,kind,group,single)=>{
        const content=group??single,alphabet=kind==='^'?superscript:subscript;
        return [...content].every(c=>alphabet[c])?[...content].map(c=>alphabet[c]).join(''):`${kind}(${content})`;
      });
      if(text===previous)break;
    }
    return text.trim();
  }).join('');
}

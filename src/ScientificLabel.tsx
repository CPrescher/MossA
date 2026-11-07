import { scientificLabel } from './scientific-label';

export function ScientificLabel({ name }: { name: string }) {
  const label = scientificLabel(name);
  if (!label.parts.some(part => part.kind === 'math')) return <>{name}</>;
  return <span className="scientific-label" role="img" aria-label={name}>{label.parts.map((part, i) => part.kind === 'text'
    ? <span key={i} aria-hidden="true">{part.source}</span>
    : <span key={i} className="scientific-label-math" aria-hidden="true" dangerouslySetInnerHTML={{ __html: part.svg }}/>)}</span>;
}

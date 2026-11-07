import { useScreenPlotText } from './useScreenPlotText';
import { centeredGaussians, gaussianDensity } from './source-profile';
import type { Project } from './types';

export function SourceShapePreview({ project }: { project: Project }) {
  const text = useScreenPlotText(600,145);
  const gs = project.source_gaussians ? centeredGaussians(project.source_gaussians) : null;
  const range = gs ? Math.max(...gs.map(g => Math.abs(g.center) + 2 * g.fwhm)) : project.source_fwhm * 3;
  const values = Array.from({ length: 401 }, (_, i) => {
    const x = -range + 2 * range * i / 400;
    const z = x / (project.source_fwhm / 2);
    return gs ? gaussianDensity(x, gs) : (project.source_squared ? 2 / (Math.PI * project.source_fwhm / 2 * (1 + z * z) ** 2) : 1 / (Math.PI * project.source_fwhm / 2 * (1 + z * z)));
  });
  const peak = Math.max(...values);
  const path = values.map((y, i) => `${i ? 'L' : 'M'}${40 + i * 1.3},${108 - 85 * y / peak}`).join(' ');
  return <div className="source-shape-preview">
    <svg ref={text.ref} style={text.style} viewBox="0 0 600 145" role="img" aria-label="Complete source response profile, centered at zero velocity">
      <title>Complete source response profile</title>
      <path d="M40,18 V108 H560" fill="none" stroke="currentColor" opacity=".35"/>
      <path d="M300,18 V108" stroke="currentColor" opacity=".15"/>
      <path d={path} fill="none" stroke="#168a87" strokeWidth="2"/>
      <g fill="currentColor" fontSize="11"><text x="40" y="123">{(-range).toPrecision(3)}</text><text x="300" y="123" textAnchor="middle">0</text><text x="560" y="123" textAnchor="end">{range.toPrecision(3)}</text><text x="300" y="140" textAnchor="middle">Source response velocity (mm/s)</text><text x="45" y="14">Source shape (unit area)</text></g>
    </svg>
  </div>;
}

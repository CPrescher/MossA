// MossA.m define1 → define2 → define3 mouse workflow. Values are starting estimates.
export function placedParameters(kind, profile, first, widthPoint, opposite, background, mode, mix = .5) {
  const fwhm = widthPoint ? Math.max(.001, 2 * Math.abs(widthPoint.x - first.x)) : .2;
  const h = fwhm / 2;
  const depth = mode === 'transmission'
    ? -Math.log(Math.max(1e-9, Math.min(.999999999, first.y / Math.max(1e-9, background))))
    : Math.max(0, background - first.y);
  const l = Math.PI * h, g = Math.sqrt(Math.PI) * h / .8326;
  const conversion = profile === 'Gaussian' ? g : profile === 'PseudoVoigt' ? mix * l + (1 - mix) * g : profile === 'LorSquared' ? l / 2 : l;
  let intensity = depth * conversion, cs = first.x, qs = 0, bhf = 0;
  if (kind === 'Doublet') { intensity *= 2; if (opposite) { cs = (first.x + opposite.x) / 2; qs = Math.abs(opposite.x - first.x); } }
  if (kind === 'Sextet') { intensity *= 4; if (opposite) { cs = (first.x + opposite.x) / 2; bhf = Math.abs(opposite.x - first.x) * 3.097; } }
  return { cs, fwhm, intensity, qs, bhf };
}

// A redraw changes values only. Scientific settings and site identity are retained.
export function updatePlacementSite(site, values) {
  const relevant = new Set(['cs', 'fwhm', 'intensity', ...(site.kind === 'Doublet' ? ['qs'] : []), ...(site.kind === 'Sextet' ? ['bhf'] : [])]);
  return { ...site, params: Object.fromEntries(Object.entries(site.params).map(([key, p]) => [key, relevant.has(key) && !p.link && values[key] !== undefined ? { ...p, value: values[key] } : p])) };
}
export function placementProject(project, site, index = null) {
  return { ...project, sites: index === null ? [...project.sites, site] : project.sites.map((s, i) => i === index ? site : s) };
}

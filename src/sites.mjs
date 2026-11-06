export function duplicateSiteAt(project, index) {
  if (!Number.isInteger(index) || index < 0 || index >= project.sites.length || project.sites.length >= 16) return { project, selected: index };
  const copy = structuredClone(project.sites[index]), selected = project.sites.length;
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? ' copy' : ` copy ${n}`;
    const name = `${copy.name.slice(0,80-suffix.length)}${suffix}`;
    if (!project.sites.some(site => site.name === name)) { copy.name = name; break; }
  }
  for (const p of Object.values(copy.params)) {
    if (p.link?.target.startsWith(`site:${index}:`)) p.link.target = p.link.target.replace(`site:${index}:`,`site:${selected}:`);
  }
  return { project: { ...project, sites: [...project.sites,copy] }, selected };
}
export function removeSiteAt(project, selected, index) {
  if (!Number.isInteger(index) || index < 0 || index >= project.sites.length) return { project, selected };
  const sites = project.sites.filter((_, i) => i !== index).map(site => ({ ...site, params: Object.fromEntries(Object.entries(site.params).map(([key, parameter]) => {
    if (!parameter.link?.target.startsWith('site:')) return [key, parameter];
    const [, source, name] = parameter.link.target.split(':'), sourceIndex = Number(source);
    return [key, { ...parameter, link: sourceIndex === index ? null : { ...parameter.link, target: `site:${sourceIndex > index ? sourceIndex - 1 : sourceIndex}:${name}` } }];
  })) }));
  const next = selected > index ? selected - 1 : selected === index ? Math.min(index, sites.length - 1) : selected;
  return { project: { ...project, sites }, selected: Math.max(0, next) };
}

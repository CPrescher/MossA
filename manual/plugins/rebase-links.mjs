// Rebase authored manual URLs and screenshot paths for the develop site.
// The stable build remains at its established /MossA/manual/ URLs.
export default function rebaseLinks({ appBase = '/MossA', sourceRef = 'main' } = {}) {
  const base = appBase.replace(/\/$/, '');
  const rewrite = value => {
    if (typeof value !== 'string') return value;
    if (value.startsWith('/MossA/manual/')) return `${base}/manual/${value.slice('/MossA/manual/'.length)}`;
    if (value === 'https://cprescher.github.io/MossA/' || value === '/MossA/') return `https://cprescher.github.io${base}/`;
    if (value.startsWith('https://github.com/CPrescher/MossA/')) return value.replace(/\/(blob|tree|edit)\/main(?=\/|$)/, `/$1/${sourceRef}`);
    return value;
  };
  return tree => {
    function visit(node) {
      if (node.type === 'element' && node.properties) {
        for (const key of ['href', 'src']) {
          if (key in node.properties) node.properties[key] = rewrite(node.properties[key]);
        }
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}

// Rebase authored manual URLs and screenshot paths for the develop site.
// The stable build remains at its established /MossA/manual/ URLs.
export default function rebaseLinks({ appBase = '/MossA', sourceRef = 'main', offline = false } = {}) {
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
      // Astro passes authored HTML through raw nodes until after user plugins.
      if (offline && node.type === 'raw') node.value = node.value.replace(
        /<iframe\b(?=[^>]*\bsrc\s*=\s*["']https?:\/\/)[^>]*>[\s\S]*?<\/iframe\s*>/gi, '');
      if (node.type === 'element' && node.properties) {
        for (const key of ['href', 'src', 'dataSrc', 'data-src']) {
          if (key in node.properties) node.properties[key] = rewrite(node.properties[key]);
        }
      }
      // The bundled desktop manual keeps the explicit external video link,
      // but must not embed an online-only player in an offline document.
      if (offline && node.children) node.children = node.children.filter(child =>
        !(child.type === 'element' && child.tagName === 'iframe' && /^https?:\/\//.test(String(child.properties?.src || ''))));
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}

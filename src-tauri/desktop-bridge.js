// Injected into both local windows, including every bundled manual page.
// External pages never load inside a window with access to desktop commands.
(() => {
  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || event.defaultPrevented) return;
    const invoke = window.__TAURI__.core.invoke;
    let url = new URL(link.href, location.href);
    const hosted = url.origin === 'https://cprescher.github.io';
    if (hosted && (url.pathname === '/MossA/' || url.pathname === '/MossA')) {
      event.preventDefault();
      invoke('focus_main').catch(report);
      return;
    }
    if (hosted && url.pathname.startsWith('/MossA/manual/')) {
      url = new URL(url.pathname + url.search + url.hash, location.href);
    }
    if (url.protocol !== location.protocol || url.host !== location.host) {
      event.preventDefault();
      invoke('open_external', { url: url.href }).catch(report);
      return;
    }
    if (url.pathname.startsWith('/manual/')) url.pathname = '/MossA' + url.pathname;
    if (link.hasAttribute('download') || /\/tutorial-data\//.test(url.pathname)) {
      event.preventDefault();
      void (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('The bundled file could not be read.');
        const data = Array.from(new Uint8Array(await response.arrayBuffer()));
        await invoke('save_file', { filename: link.download || decodeURIComponent(url.pathname.split('/').pop()), data });
      })().catch(report);
      return;
    }
    if (link.target === '_blank' || (url.pathname.startsWith('/MossA/manual/') && !location.pathname.startsWith('/MossA/manual/'))) {
      event.preventDefault();
      invoke('open_document', { path: url.pathname.slice(1) + url.search + url.hash }).catch(report);
    } else if (url.href !== link.href) {
      event.preventDefault(); location.href = url.href;
    }
  }, true);
  function report(error) { console.error(error); window.alert(`MossA could not open or save this file.\n${error}`); }
})();

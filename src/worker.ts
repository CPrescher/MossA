import init, { evaluate_json, fit_json_with_progress } from './wasm/mossa_core';
const ready = init();
ready.then(() => self.postMessage({ type: 'ready' })).catch(e => self.postMessage({ type: 'fatal', error: String(e) }));
self.onmessage = async ({ data }) => {
  try {
    await ready;
    const start = performance.now();
    const json = JSON.stringify(data.project);
    const result = JSON.parse(data.method === 'fit'
      ? fit_json_with_progress(json, (progress: string) => self.postMessage({ id: data.id, progress: JSON.parse(progress) }))
      : evaluate_json(json));
    self.postMessage({ id: data.id, result, elapsed: performance.now() - start });
  } catch (e) { self.postMessage({ id: data.id, error: String(e) }); }
};

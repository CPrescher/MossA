import init, { fit_json_with_progress } from './wasm/mossa_core';

const ready = init();
void ready.then(() => self.postMessage({ kind: 'ready' })).catch(error => self.postMessage({ kind: 'fatal', error: String(error) }));
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      await ready;
      const result = JSON.parse(fit_json_with_progress(JSON.stringify(data.project), (state: string) => {
        self.postMessage({ kind: 'progress', id: data.id, progress: JSON.parse(state) });
      }));
      self.postMessage({ kind: 'result', id: data.id, result });
    } catch (error) { self.postMessage({ kind: 'error', id: data.id, error: String(error) }); }
  });
};

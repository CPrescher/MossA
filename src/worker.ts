import init, { evaluate_json, fit_json_with_progress, evaluate_source_json, fit_source_json_with_progress } from './wasm/mossa_core';
import { fitMultiStart } from './multistart.mjs';
const ready = init();
ready.then(() => self.postMessage({ type: 'ready' })).catch(e => self.postMessage({ type: 'fatal', error: String(e) }));
self.onmessage = async ({ data }) => {
  try {
    await ready;
    const start = performance.now();
    const json = JSON.stringify(data.project);
    const notify = (progress: string) => self.postMessage({ id: data.id, progress: JSON.parse(progress) });
    const result = JSON.parse(data.method === 'fit-source' ? fit_source_json_with_progress(json, notify)
      : data.method === 'evaluate-source' ? evaluate_source_json(json)
      : data.method === 'fit' ? JSON.stringify(fitMultiStart(data.project,
          (project, progress) => JSON.parse(fit_json_with_progress(JSON.stringify(project), (state: string) => progress?.(JSON.parse(state)))),
          project => JSON.parse(evaluate_json(JSON.stringify(project))),
          progress => self.postMessage({ id: data.id, progress }))) : evaluate_json(json));
    self.postMessage({ id: data.id, result, elapsed: performance.now() - start });
  } catch (e) { self.postMessage({ id: data.id, error: String(e) }); }
};

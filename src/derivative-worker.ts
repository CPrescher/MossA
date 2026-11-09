import init, { DerivativeModel } from './wasm/mossa_core';
const ready = init();
self.onmessage = ({ data }) => {
  const port: MessagePort = data.port;
  let model: DerivativeModel | null = null;
  let queue = Promise.resolve();
  port.onmessage = ({ data }) => {
    queue = queue.then(async () => {
      try {
        await ready;
        if (data.method === 'prepare') {
          model?.free(); model = null;
          model = new DerivativeModel(data.json, data.calibration);
          port.postMessage({ id: data.id, ready: true });
        } else {
          if (!model) throw new Error('Derivative model is not prepared.');
          const values = model.columns(data.x, data.first, data.end);
          if (data.method === 'columns-shared') {
            new Float64Array(data.result).set(values, data.first * data.rows);
            const control = new Int32Array(data.control);
            Atomics.store(control, data.index, 1); Atomics.notify(control, data.index);
          } else port.postMessage({ id: data.id, values }, [values.buffer]);
        }
      } catch (error) {
        if (data.method === 'columns-shared') {
          const control = new Int32Array(data.control);
          Atomics.store(control, data.index, -1); Atomics.notify(control, data.index);
        } else port.postMessage({ id: data.id, error: String(error) });
      }
    });
  };
  port.start();
};

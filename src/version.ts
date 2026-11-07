export type BuildInfo = {
  application: string;
  version: string;
  commit: string | null;
  branch: string;
  builtAt: string | null;
  channel: string;
  dirty: boolean;
  fittingBackend?: 'native-rust' | 'wasm';
};

declare const __MOSSA_BUILD__: BuildInfo;

// Embedded in the bundle: fetching newer metadata must never relabel running code.
export const buildInfo: BuildInfo = typeof __MOSSA_BUILD__ === 'undefined'
  ? { application: 'MossA 2 preview', version: 'development', commit: null, branch: '', builtAt: null, channel: 'local', dirty: false }
  : __MOSSA_BUILD__;

export async function latestDeployment(signal: AbortSignal): Promise<string> {
  const url = new URL('build-info.json', document.baseURI);
  url.searchParams.set('check', String(Date.now()));
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Deployment check failed');
  const info = await response.json();
  if (info.application !== 'MossA 2 preview' || typeof info.commit !== 'string' || !/^[a-f0-9]{40,64}$/.test(info.commit)) {
    throw new Error('Invalid deployment metadata');
  }
  return info.commit;
}

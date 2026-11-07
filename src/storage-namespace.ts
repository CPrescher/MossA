import { buildInfo } from './version';

// GitHub Pages project paths share one origin. Preview databases and journals
// must therefore have their own names; stable names retain existing projects.
export function storageKey(key: string) {
  return buildInfo.channel === 'github-pages-preview' ? `mossa.preview.${key}` : key;
}

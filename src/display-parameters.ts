import {keys,type Site} from './types';
/** Presentation only; keep the engine's traversal and saved parameter order intact. */
export function displayKeys(site:Site) {
  const available=keys(site);
  return ['cs','fwhm','intensity','qs','bhf','a12','a13','mix'].filter(key=>available.includes(key));
}

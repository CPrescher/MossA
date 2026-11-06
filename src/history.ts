import { useReducer } from 'react';
export const HISTORY_LIMIT = 50;
export type History<T> = { past: T[]; present: T; future: T[] };
type Action<T> = { type: 'set'; value: T; record: boolean } | { type: 'undo' | 'redo' };
export function historyReducer<T>(state: History<T>, action: Action<T>): History<T> {
  if (action.type === 'set') {
    if (JSON.stringify(action.value) === JSON.stringify(state.present)) return state;
    return action.record ? { past: [...state.past, state.present].slice(-HISTORY_LIMIT), present: action.value, future: [] } : { ...state, present: action.value };
  }
  if (action.type === 'undo' && state.past.length) return { past: state.past.slice(0,-1), present: state.past.at(-1)!, future: [state.present, ...state.future].slice(0,HISTORY_LIMIT) };
  if (action.type === 'redo' && state.future.length) return { past: [...state.past,state.present].slice(-HISTORY_LIMIT), present: state.future[0], future: state.future.slice(1) };
  return state;
}
export function useSnapshotHistory<T>(initial: () => T) {
  const [history, dispatch] = useReducer(historyReducer<T>, undefined, () => ({ past: [], present: initial(), future: [] }));
  return { ...history, set: (value: T, record = true) => dispatch({ type: 'set', value, record }), undo: () => dispatch({ type: 'undo' }), redo: () => dispatch({ type: 'redo' }) };
}

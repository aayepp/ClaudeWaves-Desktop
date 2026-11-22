import { useSyncExternalStore } from 'react';

let currentPositionMs = 0;
const listeners = new Set<() => void>();

export function getPlaybackPositionMs(): number {
  return currentPositionMs;
}

export function setPlaybackPositionMs(nextMs: number): void {
  const clamped = Math.max(0, Math.round(nextMs));
  if (clamped === currentPositionMs) return;
  currentPositionMs = clamped;
  listeners.forEach((cb) => cb());
}

export function subscribePlaybackPosition(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePlaybackPositionMs(): number {
  return useSyncExternalStore(
    subscribePlaybackPosition,
    getPlaybackPositionMs,
    getPlaybackPositionMs,
  );
}

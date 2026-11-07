export type PreviewState = { owner: string; id: string; loading: boolean } | null;
export interface PreviewPlayer { play(): Promise<void>; stop(): void; onEnd(callback: () => void): void }
export function createExclusiveAudioPreview(driver: { create(source: string): PreviewPlayer; startDevice(): Promise<void>; stopDevice(): Promise<void> }) {
  let generation = 0, state: PreviewState = null;
  let player: PreviewPlayer | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let native: Promise<unknown> = Promise.resolve();
  const listeners = new Set<(state: PreviewState) => void>();
  const publish = () => listeners.forEach(listener => listener(state));
  const enqueue = (work: () => Promise<void>) => { const result = native.then(work, work); native = result.catch(() => undefined); return result; };
  const stop = (owner?: string) => {
    if (owner && state?.owner !== owner) return Promise.resolve();
    generation++; clearTimeout(timer); player?.stop(); player = undefined; state = null; publish();
    return enqueue(() => driver.stopDevice());
  };
  return {
    stop,
    subscribe(listener: (state: PreviewState) => void) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    async play(owner: string, id: string, source?: string) {
      const stopped = stop(); const token = generation; state = { owner, id, loading: true }; publish();
      try {
        await stopped; if (token !== generation) return;
        if (id === 'default') {
          await enqueue(async () => { if (token === generation) await driver.startDevice(); });
          if (token !== generation) return;
          state = { owner, id, loading: false }; publish();
          timer = setTimeout(() => { if (token === generation) void stop().catch(() => undefined); }, 1800);
        } else {
          if (!source) throw new Error('اختر ملف الصوت أولًا');
          const current = driver.create(source); player = current;
          current.onEnd(() => { if (token !== generation) return; player = undefined; state = null; publish(); });
          await current.play();
          if (token !== generation) { current.stop(); return; }
          state = { owner, id, loading: false }; publish();
        }
      } catch (error) {
        if (token !== generation) return;
        await stop().catch(() => undefined); throw error;
      }
    },
  };
}

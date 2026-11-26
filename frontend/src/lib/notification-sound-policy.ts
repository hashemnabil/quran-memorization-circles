export const SOUND_IDS = ['default', 'school', 'calm', 'electronic', 'clear', 'soft', 'bright', 'pulse', 'silent', 'custom'] as const;
export type NotificationSound = typeof SOUND_IDS[number];
export type SoundPreferences = { sound: NotificationSound; vibrate: boolean; channelId?: string };
export function parseSoundPreferences(raw: string | null, legacy: string | null): SoundPreferences {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (value && SOUND_IDS.includes(value.sound)) return { sound: value.sound, vibrate: value.vibrate === true, channelId: typeof value.channelId === 'string' ? value.channelId : undefined };
  } catch { /* Preserve an existing pre-upgrade selection. */ }
  return { sound: SOUND_IDS.includes(legacy as NotificationSound) ? legacy as NotificationSound : 'default', vibrate: false };
}
export function audioMime(name: string, mime: string) {
  if (mime.startsWith('audio/')) return mime;
  if (mime && mime !== 'application/octet-stream') return '';
  return ({ wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac' } as Record<string,string>)[name.split('.').pop()?.toLowerCase() || ''] || '';
}

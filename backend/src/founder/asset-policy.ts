export const ASSET_KINDS = ['CHAT_BACKGROUND', 'PROFILE_COVER', 'NOTIFICATION_SOUND', 'ADHAN_SOUND', 'ANNOUNCEMENT_IMAGE', 'ANNOUNCEMENT_VIDEO'] as const;
export function assetMime(kind: string, bytes: Buffer): string | null {
  if (!ASSET_KINDS.includes(kind as any) || !bytes.length || bytes.length > 5 * 1024 * 1024) return null;
  if (kind === 'ANNOUNCEMENT_VIDEO') return bytes.subarray(4, 8).toString() === 'ftyp' ? 'video/mp4' : bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ? 'video/webm' : null;
  const image = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
    : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' ? 'image/webp' : null;
  const audio = bytes.subarray(0,4).toString() === 'OggS' ? 'audio/ogg'
    : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WAVE' ? 'audio/wav'
    : bytes.subarray(0,3).toString() === 'ID3' || bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0 ? 'audio/mpeg' : null;
  return kind.endsWith('SOUND') ? audio : image;
}

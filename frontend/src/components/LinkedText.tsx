const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/giu;

export default function LinkedText({ text }: { text: string }) {
  const parts: (string | { label: string; href: string })[] = [];
  let offset = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > offset) parts.push(text.slice(offset, start));
    const label = match[0].replace(/[.,!?؛،:)}\]]+$/u, '');
    if (label) parts.push({ label, href: label.startsWith('www.') ? `https://${label}` : label });
    offset = start + match[0].length;
    if (label.length < match[0].length) parts.push(match[0].slice(label.length));
  }
  if (offset < text.length) parts.push(text.slice(offset));
  return <>{parts.map((part, index) => typeof part === 'string' ? part :
    <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="content-link break-all underline underline-offset-2">{part.label}</a>)}</>;
}

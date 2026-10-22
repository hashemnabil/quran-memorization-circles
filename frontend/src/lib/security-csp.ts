export function productionCsp(apiUrl?: string, socketUrl?: string) {
  const connect = new Set(["'self'", 'https://res.cloudinary.com', 'https://quran-memorization-circles.onrender.com', 'wss://quran-memorization-circles.onrender.com']);
  for (const value of [apiUrl, socketUrl]) {
    if (!value || value.startsWith('/')) continue;
    const url = new URL(value);
    if (!['https:', 'http:', 'wss:', 'ws:'].includes(url.protocol)) throw new Error('Invalid public transport URL');
    if (['http:', 'ws:'].includes(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Production transports require HTTPS');
    connect.add(url.origin); connect.add(url.origin.replace(/^http/, 'ws'));
  }
  return `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src ${[...connect].join(' ')}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'`;
}

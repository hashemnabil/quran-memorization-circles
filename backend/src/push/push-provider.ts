import { sign } from 'node:crypto';
import { connect } from 'node:http2';

export class PushSendError extends Error {
  constructor(public readonly code: string, public readonly invalidToken = false) { super(code); }
}
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
export function signProviderJwt(header: object, claims: object, key: string, algorithm: 'RSA-SHA256' | 'SHA256') {
  const body = `${encoded(header)}.${encoded(claims)}`;
  return `${body}.${sign(algorithm, Buffer.from(body), { key: key.replace(/\\n/g, '\n'), ...(algorithm === 'SHA256' ? { dsaEncoding: 'ieee-p1363' as const } : {}) }).toString('base64url')}`;
}
export function safePushLink(value?: string | null) {
  return value && /^\/(?!\/)[a-zA-Z0-9/_?=&%-]*$/.test(value) ? value : '/notifications';
}
export class PushProvider {
  private googleAccess?: { token: string; expires: number };
  private appleJwt?: { token: string; expires: number };
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}
  ready(platform: string) {
    return platform === 'android' ? !!(this.env.FCM_PROJECT_ID && this.env.FCM_CLIENT_EMAIL && this.env.FCM_PRIVATE_KEY)
      : platform === 'ios' && !!(this.env.APNS_KEY_ID && this.env.APNS_TEAM_ID && this.env.APNS_PRIVATE_KEY && this.env.APNS_BUNDLE_ID);
  }
  async send(platform: string, token: string, notice: { id: string; userId?: string; title: string; body: string | null; link: string | null }, notificationChannelId?: string) {
    if (!this.ready(platform)) throw new PushSendError('PROVIDER_NOT_CONFIGURED');
    const content = this.env.PUSH_INCLUDE_CONTENT === 'true';
    const title = content ? notice.title.slice(0, 150) : 'حلقات القرآن';
    const body = content ? (notice.body || 'لديك إشعار جديد').slice(0, 400) : 'لديك إشعار جديد، افتح التطبيق للاطلاع عليه';
    const data = { notificationId: notice.id, accountId: notice.userId || '', link: safePushLink(notice.link) };
    if (platform === 'android') {
      const selectedChannel = notificationChannelId && /^school-general-(default|silent|calm|electronic|clear|custom)-v1$/.test(notificationChannelId) ? notificationChannelId : 'halaqat-updates';
      const mode = selectedChannel.split('-')[2];
      const sound = mode === 'silent' ? undefined : ['calm', 'electronic', 'clear'].includes(mode) ? `school_${mode}` : 'default';
      const access = await this.googleToken();
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.env.FCM_PROJECT_ID!)}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ message: { token, notification: { title, body }, data,
          android: { priority: 'HIGH', ttl: '86400s', notification: { channel_id: selectedChannel, tag: notice.id, sound, icon: 'ic_stat_halaqat' } } } }),
      });
      if (!response.ok) {
        const result: any = await response.json().catch(() => ({}));
        const invalid = result.error?.details?.some((detail: any) => detail.errorCode === 'UNREGISTERED');
        if (response.status === 401) this.googleAccess = undefined;
        throw new PushSendError(invalid ? 'UNREGISTERED' : `FCM_${response.status}`, !!invalid);
      }
      return;
    }
    await this.appleSend(token, { aps: { alert: { title, body }, sound: 'default', 'thread-id': 'halaqat-updates' }, ...data }, notice.id);
  }
  private async googleToken() {
    if (this.googleAccess && this.googleAccess.expires > Date.now()) return this.googleAccess.token;
    const now = Math.floor(Date.now() / 1000);
    const jwt = signProviderJwt({ alg: 'RS256', typ: 'JWT' }, { iss: this.env.FCM_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, this.env.FCM_PRIVATE_KEY!, 'RSA-SHA256');
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
    if (!response.ok) throw new PushSendError(`GOOGLE_AUTH_${response.status}`);
    const result: any = await response.json();
    if (typeof result.access_token !== 'string') throw new PushSendError('GOOGLE_AUTH_INVALID');
    this.googleAccess = { token: result.access_token, expires: Date.now() + Math.min(3300, Number(result.expires_in) || 3300) * 1000 };
    return result.access_token;
  }
  private async appleSend(token: string, payload: object, id: string) {
    if (!this.appleJwt || this.appleJwt.expires <= Date.now()) {
      this.appleJwt = { token: signProviderJwt({ alg: 'ES256', kid: this.env.APNS_KEY_ID }, { iss: this.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }, this.env.APNS_PRIVATE_KEY!, 'SHA256'), expires: Date.now() + 3000000 };
    }
    await new Promise<void>((resolve, reject) => {
      const client = connect(this.env.APNS_ENVIRONMENT === 'development' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
      let settled = false;
      const deadline = setTimeout(() => finish(new PushSendError('APNS_TIMEOUT')), 10000);
      const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(deadline); client.destroy(); error ? reject(error) : resolve(); };
      client.on('error', () => finish(new PushSendError('APNS_CONNECTION')));
      const stream = client.request({ ':method': 'POST', ':path': `/3/device/${token}`, authorization: `bearer ${this.appleJwt!.token}`, 'apns-topic': this.env.APNS_BUNDLE_ID!, 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400), 'apns-collapse-id': id });
      let status = 0, result = '';
      stream.setTimeout(10000, () => finish(new PushSendError('APNS_TIMEOUT')));
      stream.on('response', headers => { status = Number(headers[':status']); });
      stream.on('data', data => { if (result.length < 4096) result += data; });
      stream.on('error', () => finish(new PushSendError('APNS_STREAM')));
      stream.on('end', () => {
        if (status === 200) return finish();
        let reason = ''; try { reason = JSON.parse(result).reason; } catch { /* provider errors contain no account data in logs */ }
        finish(new PushSendError(`APNS_${status}`, status === 410 || ['BadDeviceToken', 'Unregistered'].includes(reason)));
      });
      stream.end(JSON.stringify(payload));
    });
  }
}

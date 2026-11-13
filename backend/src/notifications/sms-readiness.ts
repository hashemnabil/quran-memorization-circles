export function smsConfiguration(env: NodeJS.ProcessEnv = process.env) {
  return {
    apiKeyConfigured: Boolean(env.OFFLINESMS_API_KEY?.trim()),
    encryptionKeyConfigured: Buffer.from(env.SMS_ENCRYPTION_KEY || '', 'base64').length === 32,
    sendingEnabled: env.OFFLINESMS_ENABLED === 'true',
  };
}

/** Only for zero-recipient probes: reject secrets, contacts and long tokens. */
export function safeProbeReason(result: any, key: string): string | undefined {
  for (const value of [result?.error?.message, result?.error?.code, result?.error, result?.message, result?.detail, result?.code]) {
    if (typeof value !== 'string' || !value || value.includes(key.trim()) || /offmsg_|bearer|https?:|@|\d{4,}|[A-Za-z0-9_\-+/=]{24,}/i.test(value)) continue;
    if (/^[\p{L}\d _.,:()+\-\[\]/'"]{1,180}$/u.test(value)) return value;
  }
  return undefined;
}

/** Store a fixed classification, never arbitrary provider text from a real SMS. */
export function providerFailureCode(result: any, httpStatus: number): string {
  const values = [result?.error?.code, result?.error?.message, result?.error, result?.message, result?.detail, result?.code].filter(value => typeof value === 'string').join(' ').toLowerCase();
  if (/insufficient|not enough|balance|points|credits/.test(values)) return 'PROVIDER_BALANCE_OR_POINTS';
  if (/country|region|coverage/.test(values)) return 'PROVIDER_COUNTRY_UNSUPPORTED';
  if (/relay|gateway|sender|device/.test(values)) return 'PROVIDER_SENDER_UNAVAILABLE';
  if (/not registered|not found|unregistered/.test(values) && /recipient|phone|user/.test(values)) return 'PROVIDER_RECIPIENT_NOT_REGISTERED';
  if (/phone|recipient|number|e.?164/.test(values)) return 'PROVIDER_RECIPIENT_INVALID';
  if (/organization|approval|approved|account|suspend/.test(values)) return 'PROVIDER_ACCOUNT_CONFIGURATION';
  return `HTTP_${httpStatus}`;
}

/** Zero recipients, no phone numbers/text and no possibility of sending an SMS. */
export async function checkOfflineSmsConnection(key = process.env.OFFLINESMS_API_KEY, send: typeof fetch = fetch) {
  if (!key?.trim()) return { outcome: 'MISSING_API_KEY' };
  const endpoint = 'https://business.offlinesms.com/api/v1/org/messages/send';
  const options = { method: 'POST', body: JSON.stringify({ messages: [] }), redirect: 'error' as const };
  try {
    const anonymous = await send(endpoint, { ...options, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000) });
    const anonymousStatus = anonymous.status;
    await anonymous.body?.cancel();
    const authorized = await send(endpoint, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.trim()}` }, signal: AbortSignal.timeout(10000) });
    let result: any;
    try { result = await authorized.json(); } catch { /* No raw provider body or exception enters logs. */ }
    const acceptedSignal = result?.ok === true || result?.success === true || result?.status === 'success';
    const authenticationConfirmed = [401, 403].includes(anonymousStatus) && (authorized.ok || [400, 422].includes(authorized.status));
    return {
      outcome: authenticationConfirmed ? 'AUTHENTICATION_CONFIRMED_ZERO_RECIPIENTS' : [401, 403].includes(authorized.status) ? 'API_KEY_REJECTED' : 'AUTHENTICATION_NOT_CONFIRMED',
      anonymousStatus,
      authorizedStatus: authorized.status,
      acceptedSignal,
      validationReason: safeProbeReason(result, key),
      validationCategory: providerFailureCode(result, authorized.status),
      // Only structural booleans, never response text, identifiers or credentials.
      responseShape: { okBoolean: typeof result?.ok === 'boolean', nestedError: typeof result?.error?.code === 'string', successBoolean: typeof result?.success === 'boolean', statusString: typeof result?.status === 'string', errorsPresent: result?.errors != null, dataPresent: result?.data != null },
    };
  } catch { return { outcome: 'CONNECTION_FAILED' }; }
}

export function smsConfiguration(env: NodeJS.ProcessEnv = process.env) {
  return {
    apiKeyConfigured: Boolean(env.OFFLINESMS_API_KEY?.trim()),
    encryptionKeyConfigured: Buffer.from(env.SMS_ENCRYPTION_KEY || '', 'base64').length === 32,
    sendingEnabled: env.OFFLINESMS_ENABLED === 'true',
  };
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
    const acceptedSignal = result?.success === true || result?.status === 'success';
    const authenticationConfirmed = [401, 403].includes(anonymousStatus) && (authorized.ok || [400, 422].includes(authorized.status));
    return {
      outcome: authenticationConfirmed ? 'AUTHENTICATION_CONFIRMED_ZERO_RECIPIENTS' : [401, 403].includes(authorized.status) ? 'API_KEY_REJECTED' : 'AUTHENTICATION_NOT_CONFIRMED',
      anonymousStatus,
      authorizedStatus: authorized.status,
      acceptedSignal,
      // Only structural booleans, never response text, identifiers or credentials.
      responseShape: { successBoolean: typeof result?.success === 'boolean', statusString: typeof result?.status === 'string', errorsPresent: result?.errors != null, dataPresent: result?.data != null },
    };
  } catch { return { outcome: 'CONNECTION_FAILED' }; }
}

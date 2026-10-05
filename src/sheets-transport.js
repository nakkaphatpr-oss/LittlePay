// Retry only transient failures, always using the exact same operation ID/body.
// No ledger values, tokens, URLs or Google response bodies are logged.
export async function callSheets({ url, body, request = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), log = entry => console.info(JSON.stringify(entry)), now = Date.now }) {
  const started = now();
  let uncertain = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const at = now();
    let failure, result, upstreamStatus;
    try {
      const response = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
        signal: AbortSignal.timeout(Math.max(1, Math.min(20000, 44000 - (now() - started)))), redirect: 'follow' });
      upstreamStatus = response.status;
      if (!response.ok) {
        const access = [401, 403, 404].includes(response.status);
        failure = { status: response.status === 429 ? 429 : 502, code: access ? 'GOOGLE_ACCESS' : response.status === 429 ? 'GOOGLE_BUSY' : 'GOOGLE_HTTP',
          error: access ? 'Google ปฏิเสธการเชื่อมต่อ กรุณาตรวจสิทธิ์และ deployment ของ Apps Script' : response.status === 429 ? 'Google จำกัดจำนวนคำขอชั่วคราว กรุณารอสักครู่แล้วลองคำสั่งเดิม' : 'Google ตอบกลับผิดพลาดชั่วคราว ยังยืนยันผลไม่ได้ กรุณาลองคำสั่งเดิม',
          retryable: [408, 429, 500, 502, 503, 504].includes(response.status), outcomeUnknown: !access };
      } else {
        try { result = await response.json(); } catch (error) {
          if (['TimeoutError', 'AbortError'].includes(error.name)) throw error;
          failure = { status: 502, code: 'GOOGLE_RESPONSE', error: 'Google ตอบกลับไม่สมบูรณ์ ยังยืนยันผลไม่ได้ กรุณาลองคำสั่งเดิม', retryable: true, outcomeUnknown: true };
        }
        if (!failure && !result?.ok) {
          const definitive = [400, 403, 409].includes(result?.status);
          failure = { status: [400, 409, 429].includes(result?.status) ? result.status : 502,
            code: result?.status === 403 ? 'GOOGLE_ACCESS' : result?.status === 429 ? 'GOOGLE_BUSY' : definitive ? 'COMMAND_REJECTED' : 'GOOGLE_SCRIPT',
            error: definitive || result?.status === 429 ? result.error : 'Apps Script อ่านหรือบันทึกไม่สำเร็จ กรุณาลองคำสั่งเดิม หากยังเกิดซ้ำให้ตรวจการตั้งค่าและโควตา',
            retryable: !definitive, outcomeUnknown: !definitive && result?.status !== 429 };
        }
        if (!failure && (!Array.isArray(result.transactions) || !Number.isSafeInteger(result.revision))) {
          failure = { status: 502, code: 'GOOGLE_RESPONSE', error: 'ข้อมูลตอบกลับไม่ครบ ยังยืนยันผลไม่ได้ กรุณาลองคำสั่งเดิม', retryable: true, outcomeUnknown: true };
        }
      }
    } catch (error) {
      const timeout = ['TimeoutError', 'AbortError'].includes(error.name);
      failure = { status: timeout ? 504 : 502, code: timeout ? 'GOOGLE_TIMEOUT' : 'GOOGLE_NETWORK',
        error: timeout ? 'Google ใช้เวลาตอบกลับนาน ยังยืนยันผลไม่ได้ กรุณาลองคำสั่งเดิม' : 'การเชื่อมต่อ Google ขัดข้อง ยังยืนยันผลไม่ได้ กรุณาลองคำสั่งเดิม', retryable: true, outcomeUnknown: true };
    }
    log({ event: 'sheets_request', attempt, durationMs: now() - at, upstreamStatus, code: failure?.code || 'OK' });
    if (!failure) return { result, durationMs: now() - started, attempts: attempt };
    uncertain ||= failure.outcomeUnknown;
    failure.outcomeUnknown = uncertain;
    if (!failure.retryable || attempt === 2 || now() - started >= 43000) return { failure, durationMs: now() - started, attempts: attempt };
    await pause(600 + Math.floor(Math.random() * 400));
  }
}

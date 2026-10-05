import { OAuth2Client } from 'google-auth-library';
import { validateCommand } from '../public/core.js';
import { callSheets } from '../src/sheets-transport.js';

const auth = new OAuth2Client();
export function configuration(env = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.ALLOWED_EMAIL && env.APPS_SCRIPT_URL && env.SHEETS_API_SECRET?.length >= 32);
}
export function createHandler({ env = process.env, verify = (token, audience) => auth.verifyIdToken({ idToken: token, audience }), request = fetch, pause, log } = {}) {
  const inflight = new Map();
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const send = (status, body) => res.status(status).json(body);
    try {
      if (req.method === 'GET') return send(200, { configured: configuration(env), clientId: configuration(env) ? env.GOOGLE_CLIENT_ID : null });
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(405, { error: 'ไม่รองรับวิธีเรียกนี้' }); }
      if (!configuration(env)) return send(503, { error: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ Google Sheets กรุณาดูคู่มือติดตั้ง' });
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(415, { error: 'ต้องส่งข้อมูลแบบ JSON' });
      const token = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '')?.[1];
      if (!token || token.length > 10000) return send(401, { error: 'กรุณาเข้าสู่ระบบด้วย Google' });
      let payload;
      try { payload = (await verify(token, env.GOOGLE_CLIENT_ID)).getPayload(); }
      catch { return send(401, { error: 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' }); }
      if (!payload?.email_verified || payload.email?.toLowerCase() !== env.ALLOWED_EMAIL.trim().toLowerCase()) return send(403, { error: 'บัญชี Google นี้ไม่มีสิทธิ์เข้าถึงสมุดบัญชี' });
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return send(400, { error: 'ข้อมูล JSON ไม่ถูกต้อง' }); } }
      if (JSON.stringify(body || {}).length > 60000) return send(413, { error: 'ข้อมูลใหญ่เกินไป' });
      const command = body?.action === 'read' ? { action: 'read' } : validateCommand(body);
      if (command.action !== 'read' && body.clientVersion !== 2) return send(409, { error: 'มี LittlePay รุ่นใหม่ กรุณารีโหลดหน้าเว็บก่อนบันทึก เพื่อรักษาข้อมูลบัญชีและหมวดหมู่' });
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(env.APPS_SCRIPT_URL)) return send(503, { error: 'ตั้งค่า Apps Script URL ไม่ถูกต้อง' });
      const key = JSON.stringify(command);
      // Coalesce simultaneous identical requests in this warm instance; never cache stale ledger data.
      if (!inflight.has(key)) {
        const work = callSheets({ url: env.APPS_SCRIPT_URL, body: JSON.stringify({ secret: env.SHEETS_API_SECRET, command }), request, pause, log });
        inflight.set(key, work);
        void work.finally(() => { if (inflight.get(key) === work) inflight.delete(key); }).catch(() => {});
      }
      const { result, failure, durationMs } = await inflight.get(key);
      res.setHeader('Server-Timing', `sheets;dur=${durationMs}`);
      if (failure) { if (failure.retryable) res.setHeader('Retry-After', '3'); return send(failure.status, failure); }
      return send(200, { transactions: result.transactions, revision: result.revision, ...(result.settings ? { settings: result.settings, trash: result.trash, history: result.history } : {}) });
    } catch (error) {
      if (error.status === 400) return send(400, { error: error.message });
      return send(502, { error: 'ยังยืนยันผลการบันทึกไม่ได้ ตรวจสอบเครือข่ายแล้วกดลองใหม่ด้วยรายการเดิม' });
    }
  };
}
export default createHandler();

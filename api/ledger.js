import { OAuth2Client } from 'google-auth-library';
import { validateCommand } from '../public/core.js';

const auth = new OAuth2Client();
export function configuration(env = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.ALLOWED_EMAIL && env.APPS_SCRIPT_URL && env.SHEETS_API_SECRET?.length >= 32);
}
export function createHandler({ env = process.env, verify = (token, audience) => auth.verifyIdToken({ idToken: token, audience }), request = fetch } = {}) {
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
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(env.APPS_SCRIPT_URL)) return send(503, { error: 'ตั้งค่า Apps Script URL ไม่ถูกต้อง' });
      const response = await request(env.APPS_SCRIPT_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: env.SHEETS_API_SECRET, command }), signal: AbortSignal.timeout(45000), redirect: 'follow'
      });
      if (!response.ok) return send(502, { error: 'Google Sheets ไม่พร้อมใช้งาน กรุณาลองใหม่' });
      let result;
      try { result = await response.json(); } catch { return send(502, { error: 'Apps Script ตอบกลับไม่ถูกต้อง ตรวจสอบสิทธิ์ Anyone และ deployment /exec' }); }
      if (!result.ok) return send([400, 409, 429].includes(result.status) ? result.status : 502, { error: result.error || 'เชื่อมต่อ Google Sheets ไม่สำเร็จ' });
      return send(200, { transactions: result.transactions, revision: result.revision });
    } catch (error) {
      if (error.status === 400) return send(400, { error: error.message });
      return send(502, { error: 'ยังยืนยันผลการบันทึกไม่ได้ ตรวจสอบเครือข่ายแล้วกดลองใหม่ด้วยรายการเดิม' });
    }
  };
}
export default createHandler();

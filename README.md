# LittlePay — สมุดรายรับรายจ่ายส่วนตัว

Repository: [nakkaphatpr-oss/LittlePay](https://github.com/nakkaphatpr-oss/LittlePay)

เว็บภาษาไทยด้วย **HTML + CSS + JavaScript** สำหรับเจ้าของบัญชีคนเดียว หน้าเว็บบน Vercel และข้อมูลอยู่ใน Google Sheet ส่วนตัว ไม่ต้องซื้อฐานข้อมูลหรือโดเมน ใช้ URL `*.vercel.app` ได้

## สถานะของโครงการ

โค้ดพร้อมตั้งค่าและทดสอบในเครื่อง มีโหมดทดลองแยกจากข้อมูลจริง **การนำโค้ดขึ้น GitHub ไม่ได้เชื่อม Google Login หรือฐานข้อมูลอัตโนมัติ** ต้องตั้งค่า Google และ Vercel ด้านล่าง การทดสอบอัตโนมัติใช้ฐานข้อมูลจำลอง ยังต้องทดสอบจริงหลัง deploy Apps Script และตั้ง Google Login

## ความสามารถ

- เพิ่ม แก้ไข ลบรายรับรายจ่าย วันที่ หมวดหมู่ และหมายเหตุ
- หมวดเริ่มต้นและพิมพ์หมวดใหม่ในฟอร์มได้ หมวดที่ใช้งานแล้วปรากฏเป็นตัวเลือก
- ภาพรวมรายเดือน รายรับ รายจ่าย ส่วนต่าง กราฟรายวัน และสัดส่วนตามหมวด
- ค้นหา กรอง แบ่งหน้ารายการ และดูย้อนหลังทุกเดือน
- ส่งออก CSV ตามตัวกรอง และ JSON ครบทุกเดือน
- นำเข้า JSON เพิ่มเฉพาะ ID ที่ยังไม่มี ครั้งละ 50 รายการ พร้อมสถานะเมื่อการนำเข้าหยุดกลางทาง
- Google Login ตรวจลายเซ็น token ฝั่งเซิร์ฟเวอร์ด้วย `google-auth-library` และจำกัดอีเมลเจ้าของคนเดียว
- คำนวณจำนวนเต็มหน่วยสตางค์ ป้องกันข้อผิดพลาดทศนิยม
- ป้องกันบันทึกซ้ำหลังเครือข่ายขัดข้อง ตรวจ revision ก่อนแก้ไข และล็อกการเขียนบน Apps Script
- มือถือ/คอมพิวเตอร์ ใช้แป้นพิมพ์ได้ รองรับ reduced motion

ส่วนต่างของเดือน **ไม่ใช่ยอดเงินในบัญชีจริง** ยังไม่มีบัญชีธนาคารหลายบัญชี ยอดยกมา การโอนระหว่างบัญชี งบประมาณ และรายการประจำ

## สถาปัตยกรรม

```text
Browser: public/index.html + styles.css + app.js
  │ Google ID token (เก็บในหน่วยความจำเท่านั้น)
  ▼
Vercel Function: api/ledger.js
  │ ตรวจลายเซ็น + audience + อายุ token + email_verified + อีเมลเจ้าของ
  │ ส่ง secret ผ่าน HTTPS ระหว่างเซิร์ฟเวอร์เท่านั้น
  ▼
Google Apps Script Web App: apps-script/Code.gs
  │ ตรวจ secret → ScriptLock → ตรวจ revision / operation ID → append event
  ▼
Google Sheet: แท็บ LedgerEvents
```

ไม่ใช้ service account JSON key และไม่แชร์ Sheet แบบสาธารณะ Shared secret อยู่ใน Vercel Environment Variables และ Apps Script Script Properties เท่านั้น หน้าเว็บเห็นเพียง OAuth Client ID ซึ่งเป็นข้อมูลสาธารณะ

## 1. ทดลองในเครื่อง

ต้องมี Node.js 24 และ pnpm 11.25.0:

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

เปิด `http://127.0.0.1:3000` แล้วกด **ลองใช้งานด้วยข้อมูลตัวอย่าง** โหมดนี้เก็บเฉพาะใน localStorage ชื่อ `baankhao-demo-v1` ไม่ใช่ฐานข้อมูลจริง ถ้าพื้นที่จัดเก็บถูกปิดจะไม่แสดงว่าบันทึกสำเร็จ ไม่มีการเข้าโหมดทดลองอัตโนมัติเมื่อฐานข้อมูลจริงล่ม

```sh
pnpm test
pnpm run check
pnpm build
```

คำสั่ง build สร้าง `dist/` และรวม `public/core.js` กับ `src/apps-script.js` เป็น `apps-script/Code.gs` หากแก้ตรรกะฐานข้อมูล ให้ build แล้วคัดลอก Code.gs ใหม่และ deploy Apps Script เวอร์ชันใหม่ด้วย

## 2. สร้าง Google Sheet และ Apps Script

1. สร้าง Google Sheet ส่วนตัว เก็บ Spreadsheet ID จาก URL ระหว่าง `/d/` กับ `/edit` ไม่ต้องเปิดแชร์สาธารณะ
2. ใน Sheet เลือก **Extensions → Apps Script**
3. แทนที่เนื้อหา `Code.gs` ด้วยไฟล์ [`apps-script/Code.gs`](apps-script/Code.gs) ในโปรเจกต์นี้
4. Project Settings → เปิด Show `appsscript.json` manifest file แล้วใส่เนื้อหาจาก [`apps-script/appsscript.json`](apps-script/appsscript.json)
5. สร้าง secret สุ่มสำหรับโปรเจกต์นี้ เก็บเป็นความลับ:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

6. ใน **Project Settings → Script Properties** เพิ่ม:

   | ชื่อ | ค่า |
   | --- | --- |
   | `SPREADSHEET_ID` | ID ของ Sheet จากข้อ 1 |
   | `SHEETS_API_SECRET` | secret ที่เพิ่งสร้าง |

7. เลือกฟังก์ชัน `setup` แล้ว Run และอนุญาตการเข้าถึง Spreadsheet ของคุณ ระบบสร้างแท็บ `LedgerEvents` ให้โดยไม่ลบแท็บอื่น
8. **Deploy → New deployment → Web app** ตั้ง Execute as: **Me** และ Who has access: **Anyone** เพื่อให้ Vercel เรียกแบบ server-to-server ได้ ใครที่ไม่มี secret จะอ่านหรือเขียนไม่ได้
9. คัดลอก URL ลงท้าย `/exec` เก็บไว้ใส่ใน Vercel ไม่ใช้ URL `/dev`

หากบัญชีองค์กรไม่อนุญาต Apps Script แบบ Anyone ต้องให้ผู้ดูแลอนุญาตหรือใช้บัญชีส่วนตัวที่คุณควบคุม ห้ามเผยแพร่ secret เพื่อแก้ปัญหาการเข้าถึง

## 3. เตรียม Google Login

1. เปิด [Google Cloud Console](https://console.cloud.google.com/) สร้างโปรเจกต์สำหรับแอปนี้
2. ตั้งค่า **Google Auth Platform** (Branding, Audience) ใส่ชื่อแอป อีเมลติดต่อ และบัญชีทดสอบของคุณหากอยู่ในโหมด Testing
3. สร้าง **OAuth Client ID → Web application**
4. เพิ่ม Authorized JavaScript origins สำหรับ URL จริง เช่น `https://your-app.vercel.app` โดยไม่มี path และสำหรับทดสอบในเครื่องเพิ่ม `http://localhost:3000` กับ `http://127.0.0.1:3000`
5. คัดลอก **Client ID** ไม่ต้องใช้ Client Secret แอปใช้ Google Identity Services เพื่อยืนยันตัวตนเท่านั้น ไม่ขอสิทธิ์อ่าน Drive ผ่านหน้าเว็บ

ใช้โดเมน production ที่คงที่ ไม่ใช้ preview URL ที่เปลี่ยนทุก deployment เป็นจุดเข้าใช้งานประจำ หาก Google แจ้ง origin mismatch ให้ตรวจ URL ให้ตรงทุกตัวรวม scheme และ port

## 4. นำขึ้น GitHub และ Vercel

แนะนำ repository ส่วนตัวภายใต้บัญชี GitHub ส่วนบุคคลเพื่อให้เหมาะกับ Vercel Hobby

1. Repository สำหรับแอปนี้: [nakkaphatpr-oss/LittlePay](https://github.com/nakkaphatpr-oss/LittlePay)
2. ถ้าโฟลเดอร์ยังไม่ใช่ git repository ให้ `git init` ก่อน แล้วรัน:

   ```sh
   git add .
   git commit -m "Build personal ledger with Google Sheets storage"
   git branch -M main
   git remote add origin https://github.com/nakkaphatpr-oss/LittlePay.git
   git push -u origin main
   ```

   ถ้ามี remote `origin` อยู่แล้ว ตรวจสอบด้วย `git remote -v` ก่อน อย่าเพิ่มซ้ำ อย่า commit `.env.local` หรือ secret

3. Vercel → **Add New → Project → Import Git Repository**
4. Framework Preset: **Other**, Root Directory: root ของ repository, Node.js: **24.x**
5. ใช้ค่าจาก `vercel.json` โดยไม่ override: Install `npx --yes pnpm@11.25.0 install --frozen-lockfile`, Build `node scripts/build.mjs`, Output `dist` การระบุเวอร์ชัน pnpm ช่วยให้ใช้ lockfile เดียวกับที่ทดสอบในเครื่อง
6. เพิ่ม Environment Variables สำหรับ Production:

   | ตัวแปร | ค่า |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | OAuth Client ID |
   | `ALLOWED_EMAIL` | อีเมล Google เจ้าของบัญชี เช่น `you@gmail.com` |
   | `APPS_SCRIPT_URL` | Web app URL ลงท้าย `/exec` |
   | `SHEETS_API_SECRET` | secret เดียวกับ Script Properties |

7. Deploy แล้วนำ URL production ไปเพิ่มใน Authorized JavaScript origins ของ Google
8. ถ้าเปลี่ยน Environment Variables หลัง deploy ให้ redeploy เพื่อให้มีผล
9. สำหรับทดสอบฐานข้อมูลจริงในเครื่อง คัดลอก `.env.example` เป็น `.env.local` แล้วกรอกค่าเดียวกันและรัน `pnpm dev` ใหม่

ไม่ตั้งค่าฐานข้อมูล production ให้ preview deployment ของโค้ดที่ยังไม่ไว้ใจ หากต้องทดสอบบน preview ให้ใช้ Sheet และ Apps Script แยก รวมถึง OAuth origin ของ preview นั้น

CI บน GitHub รัน syntax checks, tests และ build ทุก push/PR ส่วน Vercel Git Integration deploy ให้เอง ไม่ต้องเก็บ Vercel token ใน GitHub

## 5. ตรวจสอบหลังเชื่อมบัญชีจริง

- เข้าแอปด้วยอีเมลเจ้าของได้ บัญชีอื่นต้องถูกปฏิเสธ
- เพิ่มรายรับ 100 บาท รายจ่าย 10.10 บาท ได้ส่วนต่าง 89.90 บาท
- เปิดใหม่หรือเข้าจากอีกเครื่องแล้วพบรายการเดิม
- แก้ไข ลบ กรองเดือน และส่งออก JSON แล้วนำเข้าไฟล์เดิม ต้องไม่เพิ่มรายการซ้ำ
- เปิดสองหน้าต่าง แก้จากหน้าต่างแรก แล้วแก้จากหน้าต่างเก่าต้องแจ้งให้รีเฟรช
- ตรวจแท็บ `LedgerEvents` มีแถวประวัติใหม่หลังบันทึก โดยไม่เปิด Sheet เป็นสาธารณะ
- หากเครือข่ายขัดข้องหลังส่งคำสั่ง กด **ลองบันทึกอีกครั้ง** คำสั่งเดิมจะไม่เพิ่มรายการซ้ำ

## การเก็บข้อมูลระยะยาว

- LedgerEvents เป็นบันทึกเหตุการณ์ 1 แถวต่อคำสั่ง ไม่ใช่ตารางแก้ไขด้วยมือ คอลัมน์ `payload_json` มีรายการและจำนวนเงินหน่วยสตางค์ หน้าเว็บสร้างสถานะปัจจุบันจากประวัตินี้
- **อย่าลบ เรียงใหม่ หรือแก้แถวใน LedgerEvents** เพราะ revision จะไม่ตรง โปรแกรมตรวจพบแล้วหยุดอ่านแทนการแสดงยอดที่อาจผิด ถ้าต้องการเปิดตารางอ่านง่ายให้ส่งออก CSV จากหน้าเว็บ
- การลบในแอปเป็นการนำออกจากยอดปัจจุบัน ประวัติเดิมยังอยู่ใน Sheet การลบข้อมูลถาวรต้องจัดการสำเนา/ประวัติแยกต่างหาก
- สำรอง JSON ทุกเดือนและหลังบันทึกจำนวนมาก เก็บสำเนา Sheet เป็นระยะ JSON เก็บสถานะรายการล่าสุด ไม่รวมประวัติการแก้ไข ใช้สำเนา Sheet หากต้องการเก็บประวัติครบ
- การกู้คืนแบบสะอาด: สร้าง Sheet และ Apps Script ใหม่ ตั้งค่าตามคู่มือแล้วนำเข้า JSON ระบบนำเข้าปกติไม่ทับรายการที่มี ID เดิม
- เก็บ deployment URL, Cloud project และบัญชีเจ้าของให้เข้าถึงได้ เปลี่ยน secret ทั้งสองฝั่งหากสงสัยว่ารั่ว
- เรียกอ่านเมื่อเข้าสู่ระบบ/กดรีเฟรช และเขียนเมื่อกดบันทึก ไม่มี polling ไม่มีงานตั้งเวลาบังคับ ไม่มี dependency ฝั่งหน้าจอ
- Sheets/Apps Script เหมาะกับบัญชีส่วนตัวปริมาณไม่มาก แต่ไม่ใช่ฐานข้อมูลธุรกรรมขนาดใหญ่ ทุกการเรียกอ่านประวัติทั้งหมด จึงช้าลงตามจำนวนเหตุการณ์ ควรประเมินเมื่อมีหลักหมื่นเหตุการณ์หรือเริ่มช้า แยกปีโดยสำรองก่อน หรือย้ายฐานข้อมูลผ่านโครงสร้าง JSON เดิม
- มี ScriptLock ป้องกันการเขียนพร้อมกัน เฉพาะสคริปต์โปรเจกต์เดียว **อย่าให้ Apps Script หลายโปรเจกต์เขียน Sheet เดียวกัน**
- เมื่อ token หมดอายุจะต้องเข้าสู่ระบบใหม่ ข้อมูลจริงอยู่ใน Google Sheets ไม่มี token หรือสำเนาข้อมูลจริงค้างใน localStorage

## ค่าใช้จ่ายและข้อจำกัด

ออกแบบเพื่อลดค่าใช้จ่าย แต่ไม่มีบริการใดรับประกันเงื่อนไขฟรีตลอดไป:

- [Vercel Hobby](https://vercel.com/pricing): สำหรับการใช้งานส่วนตัวแบบไม่เชิงพาณิชย์ มีเพดานการใช้งาน ใช้โดเมน `vercel.app` ได้โดยไม่ซื้อโดเมน
- [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas): มีโควตาและข้อจำกัด runtime ซึ่งอาจเปลี่ยนได้ คำสั่งที่เกินโควตาจะล้มเหลว
- [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web): คำสั่งทำงานในสิทธิ์เจ้าของ deployment
- [Verify Google ID tokens](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token): ตรวจสอบด้วยไลบรารีฝั่งเซิร์ฟเวอร์ ไม่เชื่อข้อมูลอีเมลจากหน้าเว็บ

## แก้ปัญหาที่พบบ่อย

| อาการ | ตรวจสอบ |
| --- | --- |
| เห็นแต่โหมดทดลอง | ตั้ง env ให้ครบและ redeploy |
| Login origin mismatch | Google OAuth origins ต้องตรง URL ปัจจุบัน |
| บัญชีไม่มีสิทธิ์ | `ALLOWED_EMAIL` ต้องตรงอีเมล Google ที่ยืนยันแล้ว |
| Apps Script ส่ง HTML กลับมา | URL ต้องลงท้าย `/exec` และ deployment ต้องอนุญาต Anyone |
| อ่าน Sheet ไม่สำเร็จ | Script Properties, Sheet ID, รัน setup, สิทธิ์เจ้าของ, โควตา |
| แจ้งข้อมูลเปลี่ยนจากหน้าต่างอื่น | รีเฟรช ดูข้อมูลล่าสุด แล้วแก้ไขใหม่ |
| นำเข้าหยุดกลางทาง | จัดการคำสั่งที่ค้าง รีเฟรช แล้วนำเข้าไฟล์เดิมอีกครั้ง |
| แก้ Apps Script แต่ยังเป็นเวอร์ชันเดิม | Manage deployments → Edit → New version → Deploy |

## โครงสร้างไฟล์

```text
public/             HTML, CSS, JavaScript หน้าเว็บและตรรกะร่วม
api/ledger.js       Vercel API ตรวจ Google Login และส่งคำสั่งไป Apps Script
src/apps-script.js  ซอร์สฐานข้อมูล พร้อม locking / revision / idempotency
apps-script/        ไฟล์สำหรับคัดลอกไป Google Apps Script
scripts/            dev server และ build
test/               ทดสอบข้อมูล API และ Apps Script จำลอง
.github/workflows/  ตรวจสอบโค้ดอัตโนมัติ
```

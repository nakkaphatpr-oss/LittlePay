# ผลตรวจสอบ — 3 ตุลาคม 2026

## ผ่านในเครื่อง

- Node.js 24: syntax checks, build หน้าเว็บ และสร้าง Apps Script bundle
- ติดตั้ง dependency จาก pnpm lockfile แบบ frozen สำเร็จ
- Automated tests: **16 ผ่าน / 0 ไม่ผ่าน**
- คำนวณเงินเป็นสตางค์, วันที่ผิด, CRUD, ตัวกรอง, JSON round trip, CSV escaping และป้องกัน formula injection
- API ปฏิเสธ token ที่ขาด/หมดอายุ/อีเมลไม่ตรง/ไม่ยืนยัน โดยไม่แตะฐานข้อมูล (จำลอง Google verifier)
- Apps Script จำลอง: durable retry, stale revision, lock release, corrupt ledger และ import ที่ไม่เขียนทับ

## ตรวจผ่านเบราว์เซอร์ในโหมดทดลอง

- เพิ่มรายจ่าย 10.10 บาท แก้เป็น 20.20 บาท รีโหลดแล้วข้อมูลยังอยู่ ค้นหาและลบได้
- ยอดรายจ่ายกลับเป็น 7,740.00 บาทหลังนำรายการทดสอบออก
- นำเข้า fixture JSON 1 รายการ แล้วพบรายรับ 123.45 บาทในเดือนกันยายน
- ตรวจจอมือถือขนาดประมาณ 390 px: ไม่มีหน้าเว็บล้นแนวนอน
- Console warnings/errors: ไม่พบระหว่าง flow ที่ทดสอบ
- กดส่งออก JSON แล้วไม่มี console error แต่เครื่องมือเบราว์เซอร์ไม่ได้ส่ง download event กลับมา จึงยังไม่ยืนยันไฟล์ดาวน์โหลดจาก UI; การสร้างและอ่านข้อมูล JSON ทดสอบแล้วด้วย automated tests

## ตรวจบริการออนไลน์แล้ว

- GitHub main มีซอร์ส LittlePay และ GitHub Actions run 37118922231 ผ่าน
- Vercel production deployment อยู่ในสถานะ READY ที่ https://littlepay.vercel.app
- เปิดเว็บบนโดเมนจริงและเข้าโหมดทดลองได้ ไม่พบ console warnings/errors ระหว่างตรวจ
- Apps Script ที่ผูกกับ Sheet บันทึกโค้ดและ manifest แล้ว setup รันสำเร็จและ deploy Web App v1 แล้ว
- ทดสอบ Apps Script API จริง: secret ผิดถูกปฏิเสธด้วย status 403; secret ถูกอ่านได้ revision 0 และไม่มีรายการ โดยไม่เขียนข้อมูลทดสอบ
- ตั้งค่า OAuth Web Client และ Vercel Production environment ครบแล้ว redeploy READY; /api/ledger ตอบ configured:true
- หน้าเว็บจริงแสดงปุ่ม Google Sign-in แล้ว ยังไม่ได้ยืนยันการลงชื่อเข้าใช้และ CRUD ผ่านเบราว์เซอร์ของเจ้าของ

## ยังต้องตรวจหลังตั้งค่าจริง

- Google OAuth origins และการเข้าสู่ระบบบัญชีเจ้าของจริง
- การเขียน แก้ไข และลบ Google Sheet ผ่านเว็บหลังตั้งค่า Google Login
- การทำงานของ Vercel Function ร่วมกับ Google Login และฐานข้อมูลหลังตั้งค่าครบ

ได้รับ repository `nakkaphatpr-oss/LittlePay` และเตรียม Sheet ที่มีแท็บ LedgerEvents แล้ว รายละเอียดการเชื่อมบัญชีอยู่ในไฟล์ local ที่ไม่เผยแพร่ ยังขาด OAuth Client ID และ Apps Script deployment จึงยังไม่ได้ทดสอบฐานข้อมูลจริง ดู README สำหรับขั้นตอนและรายการตรวจหลัง deploy

## อัปเดตชื่อ LittlePay

- เปลี่ยนชื่อบนหน้าเว็บ เมตาดาตา package และไฟล์ดาวน์โหลดเป็น LittlePay
- ยังคงอ่านไฟล์สำรองรูปแบบเดิมได้ และไม่ล้างข้อมูลทดลองเดิมจากเบราว์เซอร์
- ทดสอบทั้งหมด 16 กรณีผ่านหลังเปลี่ยนชื่อ รวมการอ่าน backup รูปแบบ LittlePay และรูปแบบเดิม

## ตรวจ v2 — 5 ตุลาคม 2026

- ทดสอบ 23 กรณีผ่าน รวมการโอนและยอดบัญชี การกู้คืน การย้ายหมวดหมู่ งบ รายการประจำปลายเดือน การกันบันทึกซ้ำ และ backup v2
- ทดสอบ Apps Script จำลอง: settings/transfer/trash/restore replay และ idempotency ผ่าน
- เบราว์เซอร์โหมดทดลอง: สร้างบัญชี 1,000 บาท โอน 100 บาท ได้ยอดปลายทาง 1,100 บาทโดยรายจ่ายไม่เพิ่ม ตั้งงบ 10,000 บาท สร้างและยืนยันรายการประจำ ลบและกู้คืนรายการโอนสำเร็จ
- ยังไม่เพิ่มข้อมูลทดสอบใน Google Sheet จริงของเจ้าของ

## การกู้คืนเมื่อบันทึกตอบช้า — 5 ตุลาคม 2026

- node --test ผ่าน 29 กรณี รวม timeout/429/503, retry ID เดิมเมื่อ commit แล้วคำตอบสูญหาย, การรวมคำขอพร้อมกันหลังตรวจสิทธิ์, การเก็บ pending ข้ามการสร้างตัวอ่านใหม่ และไม่ทิ้ง pending เมื่อ proxy 503
- Browser บน test-only server port 3002: จำลอง commit แล้วตอบ 503 ฟอร์มยังเก็บยอด/หมวด/หมายเหตุ กดลองคำสั่งเดิมแล้วยอด 19 บาท มีรายการเดียว ไม่มีการสร้างซ้ำ
- ทดสอบ persistence ผ่าน unit test; browser reload ถูก beforeunload ป้องกันไว้ จึงไม่อ้างว่าได้ทดสอบ reload จริงครบวงจร
- Build และ syntax checks ผ่าน ไม่เปลี่ยน Apps Script bundle และไม่มีการเขียนรายการทดสอบในฐานข้อมูลจริง
- อ่านฐานข้อมูลจริงสำเร็จ revision 23 / 23 รายการ และ secret ผิดถูกปฏิเสธ
- ไม่พบ runtime error clusters ในช่วงตรวจ แต่ runtime log query เดิมหมดเวลา จึงยังระบุสาเหตุของเหตุการณ์เดิมหรือเปอร์เซ็นต์ความเร็วที่ดีขึ้นไม่ได้

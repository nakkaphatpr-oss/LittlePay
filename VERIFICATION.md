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

## ยังต้องตรวจหลังตั้งค่าจริง

- Google OAuth origins และการเข้าสู่ระบบบัญชีเจ้าของจริง
- Apps Script deployment/สิทธิ์/secret และการอ่านเขียน Google Sheet จริง
- การ build และทำงานของ Vercel Function หลังเผยแพร่
- GitHub remote และ CI บน repository จริง

ได้รับ repository `nakkaphatpr-oss/LittlePay` และเตรียม Sheet ที่มีแท็บ LedgerEvents แล้ว รายละเอียดการเชื่อมบัญชีอยู่ในไฟล์ local ที่ไม่เผยแพร่ ยังขาด OAuth Client ID และ Apps Script deployment จึงยังไม่ได้ทดสอบฐานข้อมูลจริง ดู README สำหรับขั้นตอนและรายการตรวจหลัง deploy

## อัปเดตชื่อ LittlePay

- เปลี่ยนชื่อบนหน้าเว็บ เมตาดาตา package และไฟล์ดาวน์โหลดเป็น LittlePay
- ยังคงอ่านไฟล์สำรองรูปแบบเดิมได้ และไม่ล้างข้อมูลทดลองเดิมจากเบราว์เซอร์
- ทดสอบทั้งหมด 16 กรณีผ่านหลังเปลี่ยนชื่อ รวมการอ่าน backup รูปแบบ LittlePay และรูปแบบเดิม

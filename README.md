# Invoice Insight

ใช้ทักษะจากไฟล์ที่แนบ "Senior_Full_Stack_Developer_Skills"

สร้างเว็บแอปพลิเคชั่น "Sobprab Duugs Inventory"     

 ระบบ OCR เอกสาร (บิลInvevtory) วิเคราะห์และสกัดข้อมูลจากใบ Invoice 

ข้อมูลสำคัญที่ต้องการสะกัดข้อความจาก บิลมีดังนี้   

1.ชื่อบริษัท 

2.เลขประจำตัวผู้เสียภาษี   

3.เลขที่บิล   

4.วันที่บิล    

5.ชื่อพนักงานขาย 

 6.ชื่อสินค้า  (ชื่อการค้า)

7.จำนวน 

 8.ราคา/หน่วย  

9.ราคารวม/หน่วย  

10.ราคารวมสุทธิ    

*11.รหัสGPU  

*12.รหัสTPU 

การออกแบบสถาปัตยกรรมระบบ (System Architecture)

[ Mobile / Tablet User ]

        │

        ▼ (1. Capture / Upload Invoice Image)

┌─────────────────────────────────────────────────────────────┐

│ Front-End UI (Responsive HTML5 + Tailwind CSS + JS)          │

│ - มี Table,Card  Preview สำหรับตรวจสอบ/แก้ไขรายการสินค้าก่อนบันทึก   │

└──────────────────────────────┬──────────────────────────────┘

                               │

                               ▼ (2. Base64 Payload)

┌─────────────────────────────────────────────────────────────┐

│ Back-End Serverless           │

│                                                             │

│ 1. บันทึกรูปภาพ          ──► [ Google Drive Folder ]        │

│ 2. OCRสกัดข้อมูล    ──► [ เทคโนโลยี Lovable ] │

│    (Structured JSON Output: รองรับตารางสินค้า )     │

│ 3. วิเคราะห์ชื่อยาการค้าเป็นชื่อสามัญ  ──► [ อ้างอิงข้อมูลจาก Google Sheets Name: "TTMT" ] │

│ 4. Matching & Mapping ข้อมูลที่ OCR สกัดข้อมูลได้ กับ ข้อมูล จากฝ่ายจัดซื้อ  ──► [ ชื่อการค้า/ชื่อสามัญ   ข้อมูลจากฝ่ายจัดซื้อ Google Sheets Name: "PO" ] │

│ 5. บันทึกข้อมูลลง DB      ──► [ supabase DB และ Google Sheets DB ]           │

│ 6. แจ้งเตือนมื่อข้อมูลถูกบันทึกสำเร็จ  ──► [ Line OA  LINE Messaging API ] │

└──────────────────────────────┬──────────────────────────────┘

                               │

                               ▼ (3. Extracted JSON Data)

[ Display Structured Result & Editable Form on Web UI โดยใช้รูปแบบ Design จากไฟล์แนบ Design(1)]

*Google Drive Folder Name: "OCR_PIC_UPLOAD"  

*Google Drive Folder Link: https://drive.google.com/drive/folders/1uQQUoMAjMpb7wo3Gy-yAHtQRZs3WYFRL?usp=drive_link 

*Google Sheets DB:

Link:https://docs.google.com/spreadsheets/d/1frg6i2D6aK9neM4PSEO9yhR4YvlcG3o3msBooMI7lKk/edit?usp=drive_link

*Sheets "INV"  ID : 0  (จัดเก็บข้อมูลที่ OCRได้)

*Sheets "PO" ID : 147773833  (ข้อมูลรายการซื้อยา จากฝ่ายจัดซื้อ)

*Sheets "TTMT" ID : 666682627  (ข้อมูลรายละเอียดของยา ชื่อสามัญ/ชื่อการค้า/รหัสGPU/รหัสTPU สำหรับประกอบการวิเคราะห์ข้อมูลยา ในกรณีที่ บิล ไม่มีข้อมูล ข้อความที่ต้องการสกัด)

*Supabase DB API :

*Line OA Token :

โดยใช้เทคโนโลยีและวิศกรรมของ Lovable  ร่วมกับไฟล์ Design(1)  ในการออกแบบเว็บแอพพลิเคชั่น  รองรับการใช้งานแบบ PWA และปรับขนาดรูปแบบในการแสดงผลให้เหมาะสมกับแต่ละอุปกรร์ใช้งาน

Frontend UX UI รองรอบการทำงานบนโทรศัพท์ แท็บเล็ต  

-ฟังก์ชั่นอัพโหลดรูปภาพ/ ถ่ายภาพ สามาถอัพโหลดได้ครั้งละหลายรายการ   แสดงข้อความOCR ที่สกัดได้ /ข้อมูลการวิเคราะห์Matching & Mappingชื่อยาการค้ากับชื่อยาสามัญ /  การวิเคราะห์Matching & Mapping รายการยา,จำนวน, ราคา  จากชีทPO (ฝ่ายจัดซื้อ)กับชีทINV (ข้อมูลที่OCR ได้)  ให้ตรวจสอบก่อนบันทึก

-ฟังก์ชั่นประวัติการบันทึก

-ฟังก์ชั่นแสดงรายการยาที่บันทึกในรูปแบบตาราง

-ฟังก์ชั่นแสดงภาพบิลที่อัพโหลด

-ฟังก์ชั่นส่งออก/ดาวโหลดข้อมูล(Excel/JSON/VCS) ซิงค์ข้อมูล

-ฟังก์ชั่นการตั้งค่า ต่างๆ (Admin)

Blackend ใช้ google drive จัดเก็บไฟล์ภาพที่อัพโหลด  ใช้ google sheetsและ Suprabase เป็น Database  จัดเก็บข้อความ OCR ที่สะกัดได้ ในรูปแบบตาราง เชื่อมต่อและซิงค์ข้อมูลแบบเรียลไทม์

-LINE Messaging API  ส่ง แจ้งเตือนในรูปแบบ LINE Flex Message สรุปข้อมูลในบิล  รูปแบบการแสดงผล: แบบการ์ดเดี่ยว (Bubble) และแบบเลื่อนดูหลายๆ การ์ดต่อกัน (Carousel)   โดยส่งแจ้งเตือน 1 เลขที่บิล/1ครั้ง

การออกแบบฐานข้อมูล (Google Sheets Database SchemaและSuprabase)เพื่อให้จัดเก็บข้อมูลสินค้าหลายรายการต่อ 1 บิลได้อย่างถูกต้อง (Denormalized Inventory Log) จะแบ่งคอลัมน์ใน Sheet ชื่อ INV ดังนี้:

Column            HeaderName        รายละเอียด

A                     Timestamp              เวลาที่บันทึก

B                      Invoice No              เลขที่บิล

C                      Company Name     ชื่อบริษัท/ร้านค้า

D                       Tax ID                       เลขประจำตัวผู้เสียภาษี (13 หลัก)

E                        Invoice Date             วันที่ในบิล

F                        Salesperson                 พนักงานขาย

G                        GPU Code                 รหัส GPU (5-8 หลัก)

H                        TPU Code                   รหัส TPU (5-8 หลัก)

I                           Product Name            ชื่อสินค้า

J                           Quantity                        จำนวน

K                          Unit Price                    ราคา/หน่วย 

L                           Total Price                    ราคารวมรายการ 

M                           Grand Total                 ราคารวมสุทธิทั้งบิล

N                            Image URL                ลิงก์รูปภาพบน Google Drive

O	         Common name           ชื่อยาสามัญ

P                            Stetus                             สถานะการวิเเคราะห์ข้อมูล 

 @connector:google_sheets:"Google Sheets" @connector:github:"GitHub API" @connector:google_drive:"Google Drive" @connector:airtable:"Airtable" /skill:code-review /skill:accessibility

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/73b6eed1-985b-422f-ba62-756a2b1ff4e0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

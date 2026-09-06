// ============================================================
// flashSalesStore.js
// Lưu các chương trình FLASH SALE vào Google Sheets (tab "FlashSales" trong CÙNG
// file Sheet đang dùng cho đơn hàng/sản phẩm/trang chủ/khuyến mãi...) - để không
// mất khi Render deploy lại / sleep rồi khởi động lại.
//
// Khác với "Khuyến mãi" (promotionsStore.js): Flash Sale vẫn HIỂN THỊ trên trang
// chủ (khách xem) kể cả khi CHƯA tới giờ bắt đầu (để chạy đếm ngược), khách vẫn
// xem + thêm giỏ hàng bình thường lúc đó, nhưng giá tính tiền vẫn là giá gốc cho
// tới đúng thời điểm chương trình bắt đầu (logic này nằm ở promoUtils.js + server.js,
// dùng chung với khuyến mãi vì cấu trúc dữ liệu giống hệt nhau).
//
// Cấu trúc 1 chương trình Flash Sale (giống hệt cấu trúc "chương trình khuyến mãi"):
// {
//   id, name, description,
//   startAt, endAt (ISO string), endedEarly (bool),
//   displayPosition: 'none' | 'hero' | 'below-categories',
//   items: [
//     {
//       productId,
//       discountType: 'percent' | 'amount', discountValue: number,
//       limitPerPhone: number|null,           // giới hạn số lượng/1 SĐT cho cả sản phẩm
//       variantOverrides: {                     // ghi đè riêng theo từng SKU/phân loại
//         "<variantIndex>": { discountType, discountValue, limitPerPhone }
//       }
//     }
//   ]
// }
// ============================================================

const fs = require('fs');
const path = require('path');

const FLASH_SALES_FILE = path.join(__dirname, 'flash-sales.json');
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '';

const SERVICE_ACCOUNT_FILE = path.join(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_FILE || 'service-account.json');
let SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
let PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (fs.existsSync(SERVICE_ACCOUNT_FILE)) {
  try {
    const key = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_FILE, 'utf-8'));
    SERVICE_EMAIL = key.client_email || SERVICE_EMAIL;
    PRIVATE_KEY = key.private_key || PRIVATE_KEY;
  } catch (e) {
    console.error('Không đọc được file service-account.json:', e.message);
  }
}

const useSheets = Boolean(SHEET_ID && SERVICE_EMAIL && PRIVATE_KEY);

let sheetsClient = null;
async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const { google } = require('googleapis');
  const auth = new google.auth.JWT(SERVICE_EMAIL, null, PRIVATE_KEY, ['https://www.googleapis.com/auth/spreadsheets']);
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

// Tab riêng tên "FlashSales" trong CÙNG spreadsheet - LƯU Ý: phải tự tạo tab này
// trong Google Sheet trước (đặt tên đúng "FlashSales"), xem hướng dẫn đi kèm.
const SHEET_RANGE = 'FlashSales!A:B';
const HEADER_ROW = ['Key', 'ValueJSON'];
const DEFAULT_FLASH_SALES = [];

// ---------- Backend: file JSON (chỉ dùng khi chưa cấu hình Google Sheets) ----------
function fileListFlashSales() {
  if (!fs.existsSync(FLASH_SALES_FILE)) return DEFAULT_FLASH_SALES;
  return JSON.parse(fs.readFileSync(FLASH_SALES_FILE, 'utf-8'));
}
function fileSaveFlashSales(flashSales) {
  fs.writeFileSync(FLASH_SALES_FILE, JSON.stringify(flashSales, null, 2), 'utf-8');
}

// ---------- Backend: Google Sheets ----------
async function sheetListFlashSales() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  const rows = res.data.values || [];
  const dataRow = rows.find(r => r[0] === 'flashSales');
  if (!dataRow || !dataRow[1]) return DEFAULT_FLASH_SALES;
  try {
    return JSON.parse(dataRow[1]);
  } catch (e) {
    console.error('Lỗi đọc JSON flash sale từ Sheet:', e.message);
    return DEFAULT_FLASH_SALES;
  }
}
async function sheetSaveFlashSales(flashSales) {
  const sheets = await getSheetsClient();
  const values = [HEADER_ROW, ['flashSales', JSON.stringify(flashSales)]];
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'FlashSales!A1',
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

// ---------- API dùng chung ----------
async function listFlashSales() {
  return useSheets ? sheetListFlashSales() : fileListFlashSales();
}
async function saveFlashSales(flashSales) {
  return useSheets ? sheetSaveFlashSales(flashSales) : fileSaveFlashSales(flashSales);
}

module.exports = { listFlashSales, saveFlashSales, useSheets };

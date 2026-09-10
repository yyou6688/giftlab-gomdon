// ============================================================
// promotionsStore.js
// Lưu các chương trình khuyến mãi (flash sale) vào Google Sheets (tab "Promotions"
// trong CÙNG file Sheet đang dùng cho đơn hàng/sản phẩm/trang chủ...) - để không mất
// khi Render deploy lại / sleep rồi khởi động lại.
//
// Cấu trúc 1 chương trình khuyến mãi:
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

const PROMOTIONS_FILE = path.join(__dirname, 'promotions.json');
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

// Tab riêng tên "Promotions" trong CÙNG spreadsheet. Chỉ 1 dòng dữ liệu: cột A luôn là
// "promotions", cột B là TOÀN BỘ mảng chương trình khuyến mãi dạng JSON (đơn giản hơn
// tách nhiều dòng/cột, vì số sản phẩm/SKU tham gia mỗi chương trình thay đổi tuỳ lúc).
const SHEET_RANGE = 'Promotions!A:B';
const HEADER_ROW = ['Key', 'ValueJSON'];
const DEFAULT_PROMOTIONS = [];

// ---------- Backend: file JSON (chỉ dùng khi chưa cấu hình Google Sheets) ----------
function fileListPromotions() {
  if (!fs.existsSync(PROMOTIONS_FILE)) return DEFAULT_PROMOTIONS;
  return JSON.parse(fs.readFileSync(PROMOTIONS_FILE, 'utf-8'));
}
function fileSavePromotions(promotions) {
  fs.writeFileSync(PROMOTIONS_FILE, JSON.stringify(promotions, null, 2), 'utf-8');
}

// ---------- Backend: Google Sheets ----------
async function sheetListPromotions() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  const rows = res.data.values || [];
  const dataRow = rows.find(r => r[0] === 'promotions');
  if (!dataRow || !dataRow[1]) return DEFAULT_PROMOTIONS;
  try {
    return JSON.parse(dataRow[1]);
  } catch (e) {
    console.error('Lỗi đọc JSON khuyến mãi từ Sheet:', e.message);
    return DEFAULT_PROMOTIONS;
  }
}
async function sheetSavePromotions(promotions) {
  const sheets = await getSheetsClient();
  const values = [HEADER_ROW, ['promotions', JSON.stringify(promotions)]];
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'Promotions!A1',
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

// ---------- API dùng chung ----------
// MỚI: cache tạm 15 giây trong bộ nhớ - trang chủ cứ 20 giây tự gọi lại API này 1 lần,
// nếu gọi thẳng Google Sheets mỗi lần thì chỉ cần vài khách mở web cùng lúc là vượt
// quota đọc của Google (gây lỗi "Quota exceeded" tràn log). Cache ngắn để admin sửa
// khuyến mãi vẫn thấy hiệu lực gần như ngay (chờ tối đa 15 giây).
let promotionsCache = null;
let promotionsCacheAt = 0;
const PROMOTIONS_CACHE_TTL_MS = 15000;
async function listPromotions() {
  if (!useSheets) return fileListPromotions();
  const now = Date.now();
  if (promotionsCache && (now - promotionsCacheAt) < PROMOTIONS_CACHE_TTL_MS) return promotionsCache;
  const data = await sheetListPromotions();
  promotionsCache = data;
  promotionsCacheAt = now;
  return data;
}
async function savePromotions(promotions) {
  const result = await (useSheets ? sheetSavePromotions(promotions) : fileSavePromotions(promotions));
  promotionsCache = null; // MỚI: vừa lưu xong - xoá cache để lần đọc kế tiếp lấy đúng dữ liệu mới ngay
  return result;
}

module.exports = { listPromotions, savePromotions, useSheets };

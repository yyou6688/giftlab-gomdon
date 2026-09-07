// ============================================================
// homepageStore.js
// Lưu nội dung trang chủ (banner, bộ sưu tập) vào Google Sheets
// (tab "Homepage" trong CÙNG file Sheet đang dùng để lưu đơn hàng/sản phẩm)
// - để không bị mất khi Render deploy lại / sleep rồi khởi động lại.
//
// Trước đây nội dung trang chủ lưu trong homepage-content.json - đây là
// file nằm TRONG CODE (Git) / ghi trực tiếp lên ổ đĩa tạm, nên mỗi lần
// Render khởi động lại container, mọi thay đổi làm qua trang quản trị
// (sửa banner, bộ sưu tập) bị xoá sạch.
//
// Nếu CHƯA cấu hình Google Sheets (biến GOOGLE_SHEET_ID/... trong .env),
// tự động dùng lại file homepage-content.json như cũ (chỉ để chạy thử trên
// máy - trên Render thật LUÔN cần bật Google Sheets để không mất dữ liệu).
// ============================================================

const fs = require('fs');
const path = require('path');

const HOMEPAGE_FILE = path.join(__dirname, 'homepage-content.json');
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

// Tab riêng tên "Homepage" trong CÙNG spreadsheet đang lưu đơn hàng/sản phẩm.
// Chỉ có 1 dòng dữ liệu duy nhất: cột A luôn là "content", cột B là toàn bộ
// nội dung trang chủ dạng JSON (đơn giản hơn tách từng trường ra nhiều cột,
// vì cấu trúc heroSlides/collections có thể mở rộng thêm sau này).
const SHEET_RANGE = 'Homepage!A:B';
const HEADER_ROW = ['Key', 'ValueJSON'];
// MỚI: mặc định sẵn 3 ô banner trống (giống homepage-content.json gốc) để trang
// quản trị luôn hiện đủ 3 khung nhập, kể cả khi Sheet chưa có dữ liệu lần nào
const DEFAULT_CONTENT = {
  heroSlides: [
    { image: '', link: '' },
    { image: '', link: '' },
    { image: '', link: '' }
  ],
  collections: [],
  // MỚI: khối "cam kết/uy tín" cuối trang chủ (icon + tiêu đề + mô tả), admin tự thêm/
  // sửa/xoá được — mặc định giữ nguyên 3 mục đang có sẵn trên web
  trustItems: [
    { icon: '🛒', title: 'Tự đặt hàng trực tiếp', text: 'Chọn sản phẩm, điền thông tin và gửi đơn — không cần nhắn tin chờ phản hồi.' },
    { icon: '🚚', title: 'Giao hàng qua SPX', text: 'Đóng gói cẩn thận, theo dõi đơn hàng dễ dàng từ lúc gửi đến khi nhận.' },
    { icon: '✋', title: 'Nhiều món làm thủ công', text: 'Bút dao, charm đính kèm được làm tay — blindbox nguyên seal, kiểm tra kỹ trước khi gửi.' }
  ]
};

// ---------- Backend: file JSON (chỉ dùng khi chưa cấu hình Google Sheets) ----------
function fileGetContent() {
  if (!fs.existsSync(HOMEPAGE_FILE)) return DEFAULT_CONTENT;
  return JSON.parse(fs.readFileSync(HOMEPAGE_FILE, 'utf-8'));
}
function fileSaveContent(data) {
  fs.writeFileSync(HOMEPAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------- Backend: Google Sheets ----------
async function sheetGetContent() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  const rows = res.data.values || [];
  const dataRow = rows.find(r => r[0] === 'content');
  if (!dataRow || !dataRow[1]) return DEFAULT_CONTENT;
  try {
    return JSON.parse(dataRow[1]);
  } catch (e) {
    console.error('Lỗi đọc JSON nội dung trang chủ từ Sheet:', e.message);
    return DEFAULT_CONTENT;
  }
}
async function sheetSaveContent(data) {
  const sheets = await getSheetsClient();
  const values = [HEADER_ROW, ['content', JSON.stringify(data)]];
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'Homepage!A1',
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

// ---------- API dùng chung, server.js chỉ gọi 2 hàm dưới đây ----------
async function getContent() {
  return useSheets ? sheetGetContent() : fileGetContent();
}
async function saveContent(data) {
  return useSheets ? sheetSaveContent(data) : fileSaveContent(data);
}

module.exports = { getContent, saveContent, useSheets };

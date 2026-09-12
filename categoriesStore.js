// ============================================================
// categoriesStore.js
// Lưu danh mục sản phẩm vào Google Sheets (tab "Categories" trong CÙNG
// file Sheet đang dùng để lưu đơn hàng/sản phẩm/trang chủ) - để không
// bị mất khi Render deploy lại / sleep rồi khởi động lại.
//
// Trước đây danh mục lưu trong categories.json - đây là file nằm TRONG
// CODE (Git) / ghi trực tiếp lên ổ đĩa tạm, nên mỗi lần Render khởi
// động lại container, mọi thay đổi làm qua trang quản trị (thêm/sửa/
// xoá danh mục) bị xoá sạch, quay về đúng bản có sẵn trong Git.
//
// Nếu CHƯA cấu hình Google Sheets (biến GOOGLE_SHEET_ID/... trong .env),
// tự động dùng lại file categories.json như cũ (chỉ để chạy thử trên
// máy - trên Render thật LUÔN cần bật Google Sheets để không mất dữ liệu).
// ============================================================

const fs = require('fs');
const path = require('path');

const CATEGORIES_FILE = path.join(__dirname, 'categories.json');
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

// Tab riêng tên "Categories" trong CÙNG spreadsheet đang lưu đơn hàng/sản phẩm/trang chủ
const SHEET_RANGE = 'Categories!A:C';
const HEADER_ROW = ['Key', 'Label', 'SortMode'];

// Danh mục hiện có sẵn khi mới bắt đầu dùng Sheets (khớp với categories.json gốc trong repo),
// dùng để tab Categories không bị trống trơn nếu chưa lưu lần nào qua trang quản trị
const DEFAULT_CATEGORIES = [
  { key: 'butdao', label: 'Bút dao unboxing' },
  { key: 'blindbox', label: 'Blindbox' },
  { key: 'mohinh', label: 'Bean(mô hình mini)' },
  { key: 'keyring', label: 'Keyring handmade' },
  { key: 'khungtranh', label: 'Khung ảnh & Standee' },
  { key: 'khac', label: 'Phụ kiện khác' },
  { key: 'outfitdoll', label: 'Outfit doll' },
];

// MỚI: 'manual' (mặc định, ghim/mũi tên tự sắp tay) hoặc 'price-asc'/'price-desc'/'name-asc'
// (luôn tự sắp theo giá/tên, kể cả sản phẩm thêm sau này, không cần bấm lại)
const VALID_SORT_MODES = ['manual', 'price-asc', 'price-desc', 'name-asc'];

function rowToCategory(row) {
  return {
    key: row[0],
    label: row[1] || '',
    sortMode: VALID_SORT_MODES.includes(row[2]) ? row[2] : 'manual',
  };
}
function categoryToRow(c) {
  return [c.key, c.label, VALID_SORT_MODES.includes(c.sortMode) ? c.sortMode : 'manual'];
}

// ---------- Backend: file JSON (chỉ dùng khi chưa cấu hình Google Sheets) ----------
function fileListCategories() {
  if (!fs.existsSync(CATEGORIES_FILE)) return DEFAULT_CATEGORIES;
  return JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8'));
}
function fileSaveCategories(categories) {
  fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2), 'utf-8');
}

// ---------- Backend: Google Sheets ----------
async function sheetListCategories() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  const rows = res.data.values || [];
  const data = rows.slice(1).filter(r => r[0]).map(rowToCategory);
  return data.length ? data : DEFAULT_CATEGORIES;
}
// Danh mục luôn đọc/ghi CẢ danh sách cùng lúc (giống productsStore.js),
// nên cách đơn giản và chắc đúng nhất là ghi lại toàn bộ sheet mỗi lần lưu.
async function sheetSaveCategories(categories) {
  const sheets = await getSheetsClient();
  const values = [HEADER_ROW, ...categories.map(categoryToRow)];
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'Categories!A1',
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

// ---------- API dùng chung, server.js chỉ gọi 2 hàm dưới đây ----------
// MỚI: cache tạm 15 giây trong bộ nhớ - trang chủ tự gọi lại API này mỗi 20 giây,
// gọi thẳng Sheets mỗi lần dễ vượt quota Google (giống flashSalesStore.js/promotionsStore.js)
let categoriesCache = null;
let categoriesCacheAt = 0;
const CATEGORIES_CACHE_TTL_MS = 15000;
async function listCategories() {
  const now = Date.now();
  if (categoriesCache && (now - categoriesCacheAt) < CATEGORIES_CACHE_TTL_MS) return categoriesCache;
  const list = useSheets ? await sheetListCategories() : fileListCategories();
  // MỚI: đảm bảo mọi danh mục đều có sortMode hợp lệ, kể cả danh mục cũ/mặc định
  // chưa từng lưu qua đường Sheets (sortMode do sheetListCategories/rowToCategory gán)
  const result = list.map(c => VALID_SORT_MODES.includes(c.sortMode) ? c : { ...c, sortMode: 'manual' });
  categoriesCache = result;
  categoriesCacheAt = now;
  return result;
}
async function saveCategories(categories) {
  const result = await (useSheets ? sheetSaveCategories(categories) : fileSaveCategories(categories));
  categoriesCache = null; // MỚI: vừa lưu xong - xoá cache để lần đọc kế tiếp lấy đúng dữ liệu mới ngay
  return result;
}

module.exports = { listCategories, saveCategories, useSheets };

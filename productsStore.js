// ============================================================
// productsStore.js
// Lưu sản phẩm vào Google Sheets (tab "Products" trong CÙNG file Sheet
// đang dùng để lưu đơn hàng) - để không bị mất khi Render deploy lại.
//
// Trước đây sản phẩm lưu trong data/products.json - đây là file nằm
// TRONG CODE (Git), nên mỗi lần deploy lại, Render tải lại đúng bản
// trong Git và xoá sạch mọi thay đổi làm qua trang quản trị (thêm sản
// phẩm, sửa giá/kho, đổi danh mục, nhập hàng loạt từ Shopee...).
//
// Nếu CHƯA cấu hình Google Sheets (biến GOOGLE_SHEET_ID/... trong .env),
// tự động dùng lại file data/products.json như cũ (chỉ để chạy thử trên
// máy - trên Render thật LUÔN cần bật Google Sheets để không mất dữ liệu).
// ============================================================

const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
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

// Tab riêng tên "Products" trong CÙNG spreadsheet đang lưu đơn hàng
const SHEET_RANGE = 'Products!A:M';
const HEADER_ROW = ['ID', 'Tên', 'Danh mục', 'Ảnh', 'Mô tả', 'VariantsJSON', 'DetailImagesJSON', 'PriceMin', 'PriceMax', 'TotalStock', 'Hidden', 'Pinned', 'Order'];

function rowToProduct(row) {
  return {
    id: String(row[0]),
    name: row[1] || '',
    category: row[2] || 'khac',
    image: row[3] || '',
    description: row[4] || '',
    variants: row[5] ? JSON.parse(row[5]) : [],
    detailImages: row[6] ? JSON.parse(row[6]) : [],
    priceMin: Number(row[7]) || 0,
    priceMax: Number(row[8]) || 0,
    totalStock: Number(row[9]) || 0,
    hidden: row[10] === 'TRUE' || row[10] === true, // MỚI: ẩn/hiện trên trang khách xem
    pinned: row[11] === 'TRUE' || row[11] === true, // MỚI: ghim lên đầu danh sách hiển thị
    order: (row[12] !== undefined && row[12] !== '') ? Number(row[12]) : null, // MỚI: thứ tự hiển thị thủ công
  };
}
function productToRow(p) {
  return [
    p.id, p.name, p.category, p.image || '', p.description || '',
    JSON.stringify(p.variants || []), JSON.stringify(p.detailImages || []),
    p.priceMin || 0, p.priceMax || 0, p.totalStock || 0,
    p.hidden ? 'TRUE' : 'FALSE', // MỚI
    p.pinned ? 'TRUE' : 'FALSE', // MỚI
    (p.order === undefined || p.order === null) ? '' : p.order // MỚI
  ];
}

// MỚI: gán "order" mặc định cho sản phẩm chưa từng có (giữ đúng thứ tự cũ đang lưu
// trong Sheet), rồi sắp lại: sản phẩm đang ghim lên trước, còn lại theo "order" tăng dần
function normalizeAndSortProducts(products) {
  products.forEach((p, idx) => {
    if (p.pinned === undefined) p.pinned = false;
    if (p.order === undefined || p.order === null || Number.isNaN(p.order)) p.order = idx;
  });
  return products.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.order - b.order;
  });
}

// ---------- Backend: file JSON (chỉ dùng khi chưa cấu hình Google Sheets) ----------
function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8'); }

async function fileListProducts() { return readJSON(PRODUCTS_FILE); }
async function fileSaveProducts(products) { writeJSON(PRODUCTS_FILE, products); }

// ---------- Backend: Google Sheets ----------
async function sheetListProducts() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  const rows = res.data.values || [];
  return rows.slice(1).filter(r => r[0]).map(rowToProduct);
}
// Sản phẩm luôn đọc/ghi CẢ danh sách cùng lúc (khác đơn hàng chỉ thêm/sửa 1 dòng),
// nên cách đơn giản và chắc đúng nhất là ghi lại toàn bộ sheet mỗi lần lưu.
async function sheetSaveProducts(products) {
  const sheets = await getSheetsClient();
  const values = [HEADER_ROW, ...products.map(productToRow)];
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'Products!A1',
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

// ---------- API dùng chung, server.js chỉ gọi 2 hàm dưới đây ----------
// MỚI: cache tạm 15 giây trong bộ nhớ - đọc sản phẩm bị gọi rất nhiều (mỗi lần khách
// xem trang, thêm giỏ hàng, đặt đơn...), gọi thẳng Sheets mỗi lần dễ vượt quota Google
// (giống flashSalesStore.js/promotionsStore.js). Đánh đổi: có thể trễ tối đa 15 giây
// nếu vừa sửa giá/kho ở trang quản trị - chấp nhận được vì đổi lại tránh sập cả trang.
let productsCache = null;
let productsCacheAt = 0;
const PRODUCTS_CACHE_TTL_MS = 15000;
async function listProducts() {
  const now = Date.now();
  if (productsCache && (now - productsCacheAt) < PRODUCTS_CACHE_TTL_MS) return productsCache;
  const products = useSheets ? await sheetListProducts() : await fileListProducts();
  const result = normalizeAndSortProducts(products);
  productsCache = result;
  productsCacheAt = now;
  return result;
}
async function saveProducts(products) {
  const result = await (useSheets ? sheetSaveProducts(products) : fileSaveProducts(products));
  productsCache = null; // MỚI: vừa lưu xong - xoá cache để lần đọc kế tiếp lấy đúng dữ liệu mới ngay
  return result;
}

module.exports = { listProducts, saveProducts, useSheets };

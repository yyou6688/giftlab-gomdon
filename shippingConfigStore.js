// ============================================================
// shippingConfigStore.js
// Lưu cấu hình vận chuyển (cân nặng mặc định, mốc phí, quy tắc freeship)
// vào Google Sheets (tab "ShippingConfig" trong CÙNG file Sheet đang dùng
// để lưu đơn hàng/sản phẩm/trang chủ/danh mục) - để không bị mất khi
// Render deploy lại / sleep rồi khởi động lại.
//
// Trước đây cấu hình ship lưu trong shipping-config.json - đây là file
// nằm TRONG CODE (Git) / ghi trực tiếp lên ổ đĩa tạm, nên mỗi lần Render
// khởi động lại container, mọi thay đổi làm qua tab "Vận chuyển" trong
// trang quản trị bị xoá sạch, quay về đúng bản có sẵn trong Git.
//
// Nếu CHƯA cấu hình Google Sheets (biến GOOGLE_SHEET_ID/... trong .env),
// tự động dùng lại file shipping-config.json như cũ (chỉ để chạy thử trên
// máy - trên Render thật LUÔN cần bật Google Sheets để không mất dữ liệu).
// ============================================================

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'shipping-config.json');
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

// Tab riêng tên "ShippingConfig" trong CÙNG spreadsheet đang lưu đơn hàng/sản phẩm/
// trang chủ/danh mục. Chỉ có 1 dòng dữ liệu duy nhất: cột A luôn là "config", cột B
// là toàn bộ cấu hình ship dạng JSON (đơn giản hơn tách từng trường ra nhiều cột, vì
// weightTiers/freeshipRules là mảng lồng nhau, số lượng phần tử thay đổi tuỳ lúc).
const SHEET_RANGE = 'ShippingConfig!A:B';
const HEADER_ROW = ['Key', 'ValueJSON'];

// Cấu hình mặc định khi Sheet chưa có dữ liệu lần nào (khớp với shipping-config.json gốc)
const DEFAULT_CONFIG = {
  defaultWeightGram: 500,
  weightTiers: [
    { maxWeightGram: 500, fee: 20000 },
    { maxWeightGram: 1000, fee: 30000 },
    { maxWeightGram: 2000, fee: 45000 }
  ],
  extraFeePerKgAboveMax: 15000,
  freeshipRules: [
    {
      label: 'Freeship cho sản phẩm Bút dao unboxing (handmade) từ 100.000đ',
      active: true,
      targets: [
        { category: 'butdao', minOrderValue: 100000 }
      ]
    },
    {
      label: 'Freeship toàn đơn hàng từ 500.000đ',
      active: true,
      targets: [
        { category: 'all', minOrderValue: 500000 }
      ]
    }
  ],
  // MỚI: gói quà tặng - vẫn tính theo bậc số lượng như cũ, nhưng mô tả + 2 mốc giá +
  // ngưỡng miễn phí giờ admin tự chỉnh được trong trang quản trị (tab Vận chuyển)
  giftWrap: {
    active: true,
    label: 'Gói quà tặng (giấy kraft tổ ong + ruy băng)',
    priceFor1: 3000,   // phí khi giỏ hàng có đúng 1 sản phẩm
    priceFor2: 5000,   // phí khi giỏ hàng có đúng 2 sản phẩm (tổng, không phải x2)
    freeFromQty: 3     // từ số lượng này trở lên thì miễn phí gói quà
  },
  // MỚI: danh sách sản phẩm/dịch vụ kèm thêm khác - admin tự thêm/bớt, mỗi mục 1 giá cố định
  addOns: []
};

// ---------- Backend: file JSON (chỉ dùng khi chưa cấu hình Google Sheets) ----------
function fileGetConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return DEFAULT_CONFIG;
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}
function fileSaveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// ---------- Backend: Google Sheets ----------
async function sheetGetConfig() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  const rows = res.data.values || [];
  const dataRow = rows.find(r => r[0] === 'config');
  if (!dataRow || !dataRow[1]) return DEFAULT_CONFIG;
  try {
    return JSON.parse(dataRow[1]);
  } catch (e) {
    console.error('Lỗi đọc JSON cấu hình ship từ Sheet:', e.message);
    return DEFAULT_CONFIG;
  }
}
async function sheetSaveConfig(config) {
  const sheets = await getSheetsClient();
  const values = [HEADER_ROW, ['config', JSON.stringify(config)]];
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'ShippingConfig!A1',
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

// ---------- API dùng chung, shippingCalculator.js / server.js chỉ gọi 2 hàm dưới đây ----------
async function getConfig() {
  return useSheets ? sheetGetConfig() : fileGetConfig();
}
async function saveConfig(config) {
  return useSheets ? sheetSaveConfig(config) : fileSaveConfig(config);
}

module.exports = { getConfig, saveConfig, useSheets };

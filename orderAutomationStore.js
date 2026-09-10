// ============================================================
// orderAutomationStore.js
// MỚI: lưu trạng thái bật/tắt tính năng "tự động huỷ đơn chưa thanh toán sau 1
// giờ" - admin tự tắt lúc đi ngủ/nghỉ lễ (vì lúc đó xác nhận thanh toán bằng
// tay, không muốn đơn bị huỷ oan), bật lại lúc mở bán bình thường.
//
// Theo đúng khuôn mẫu shippingConfigStore.js: lưu vào Google Sheets (tab
// "OrderAutomation" trong CÙNG file Sheet đang dùng) để không bị mất khi
// Render khởi động lại container; nếu CHƯA cấu hình Google Sheets thì tự
// dùng file order-automation.json (chỉ để chạy thử trên máy).
// ============================================================

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'order-automation.json');
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

// MỚI: tự tạo tab "OrderAutomation" trong Sheet nếu chưa có - tránh phải nhờ
// người dùng tự vào Google Sheet tạo tab tay (lỗi "Unable to parse range" xảy ra
// khi đọc/ghi vào 1 tab chưa tồn tại). Chỉ kiểm tra 1 lần rồi nhớ lại kết quả,
// không phải gọi API kiểm tra mỗi lần đọc/ghi.
let sheetEnsured = false;
async function ensureSheetExists() {
  if (sheetEnsured) return;
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties.title' });
  const titles = (meta.data.sheets || []).map(s => s.properties.title);
  if (!titles.includes('OrderAutomation')) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: 'OrderAutomation' } } }] }
    });
  }
  sheetEnsured = true;
}

const SHEET_RANGE = 'OrderAutomation!A:B';
const HEADER_ROW = ['Key', 'ValueJSON'];

const DEFAULT_SETTINGS = {
  autoCancelUnpaidEnabled: true
};

// ---------- Backend: file JSON (chỉ dùng khi chưa cấu hình Google Sheets) ----------
function fileGetSettings() {
  if (!fs.existsSync(CONFIG_FILE)) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) };
}
function fileSaveSettings(settings) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

// ---------- Backend: Google Sheets ----------
async function sheetGetSettings() {
  await ensureSheetExists();
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  const rows = res.data.values || [];
  const dataRow = rows.find(r => r[0] === 'settings');
  if (!dataRow || !dataRow[1]) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(dataRow[1]) };
  } catch (e) {
    console.error('Lỗi đọc JSON cấu hình tự động hoá đơn hàng từ Sheet:', e.message);
    return DEFAULT_SETTINGS;
  }
}
async function sheetSaveSettings(settings) {
  await ensureSheetExists();
  const sheets = await getSheetsClient();
  const values = [HEADER_ROW, ['settings', JSON.stringify(settings)]];
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'OrderAutomation!A1',
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

// ---------- API dùng chung ----------
// MỚI: cache tạm 15 giây - job tự huỷ đơn chạy mỗi 5 phút, cứ mỗi lần chạy lại đọc
// thẳng Sheet thì dễ gây thêm áp lực quota Google, trong khi cấu hình này ít khi đổi
let settingsCache = null;
let settingsCacheAt = 0;
const SETTINGS_CACHE_TTL_MS = 15000;
async function getSettings() {
  if (!useSheets) return fileGetSettings();
  const now = Date.now();
  if (settingsCache && (now - settingsCacheAt) < SETTINGS_CACHE_TTL_MS) return settingsCache;
  const data = await sheetGetSettings();
  settingsCache = data;
  settingsCacheAt = now;
  return data;
}
async function saveSettings(settings) {
  const result = await (useSheets ? sheetSaveSettings(settings) : fileSaveSettings(settings));
  settingsCache = null; // xoá cache để lần đọc kế tiếp lấy đúng dữ liệu mới ngay
  return result;
}

module.exports = { getSettings, saveSettings, useSheets };

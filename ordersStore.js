// ============================================================
// ordersStore.js
// Lưu đơn hàng vào Google Sheets (để không mất dữ liệu khi host
// miễn phí khởi động lại). Nếu chưa cấu hình Google Sheets trong
// .env, tự động dùng file data/orders.json như cũ (tiện để chạy
// thử trên máy mà không cần thiết lập Google ngay).
//
// Cấu trúc 1 dòng trong sheet (theo đúng thứ tự cột):
// ID | CustomerName | Phone | Address | Note | ItemsJSON | Total | ShippingFee | FreeshipApplied | GrandTotal | Status | Paid | TrackingCode | CreatedAt | Province | Ward | AddressDetail | TotalWeightGram | GiftWrap | GiftWrapFee | AddOnsJSON | AddOnsFee | DeliveredAt | MergeGroupId | MergeOrderIdsJSON | MergeShippingFee | MergeShippingPaid | CodShipping | MergeShippingCod | CustomerEmail
// (cột MỚI nhất ở cuối: CustomerEmail — Gmail khách để báo mã vận đơn khi shop gửi hàng)
// ============================================================

const fs = require('fs');
const path = require('path');

const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '';

// Cách 1 (khuyên dùng - ít lỗi hơn): đặt nguyên file JSON key đã tải từ Google
// vào thư mục dự án, đặt tên đúng là service-account.json (hoặc đổi tên khác
// và set GOOGLE_SERVICE_ACCOUNT_FILE trong .env trỏ tới tên đó).
const SERVICE_ACCOUNT_FILE = path.join(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_FILE || 'service-account.json');

let SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
let PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

// Nếu có file service-account.json thì ưu tiên đọc từ đó (đỡ phải dán key
// thủ công vào .env - việc này rất dễ bị lỗi định dạng khi copy qua Notepad)
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

// MỚI: mở rộng từ A:AC (29 cột) sang A:AD (30 cột) để chứa CustomerEmail
// (Gmail khách, dùng gửi thông báo mã vận đơn tự động khi shop gửi hàng)
const SHEET_RANGE = 'Orders!A:AD';

function rowToOrder(row) {
  return {
    id: Number(row[0]),
    customerName: row[1] || '',
    phone: row[2] || '',
    address: row[3] || '',
    note: row[4] || '',
    items: row[5] ? JSON.parse(row[5]) : [],
    total: Number(row[6]) || 0,
    shippingFee: Number(row[7]) || 0,
    freeshipApplied: row[8] || null,
    grandTotal: Number(row[9]) || 0,
    status: row[10] || 'moi',
    paid: row[11] === 'TRUE' || row[11] === true,
    trackingCode: row[12] || '',
    createdAt: row[13] || new Date().toISOString(),
    province: row[14] || '',
    ward: row[15] || '',
    addressDetail: row[16] || '',
    totalWeightGram: Number(row[17]) || 0,
    giftWrap: row[18] === 'TRUE' || row[18] === true,
    giftWrapFee: Number(row[19]) || 0,
    addOns: row[20] ? JSON.parse(row[20]) : [],
    addOnsFee: Number(row[21]) || 0,
    deliveredAt: row[22] || '', // MỚI: thời điểm đơn được đánh dấu "Đã giao"
    mergeGroupId: row[23] ? Number(row[23]) : null, // MỚI: gộp đơn
    mergeOrderIds: row[24] ? JSON.parse(row[24]) : [],
    mergeShippingFee: row[25] !== undefined && row[25] !== '' ? Number(row[25]) : null,
    mergeShippingPaid: row[26] === 'TRUE' || row[26] === true,
    codShipping: row[27] === 'TRUE' || row[27] === true, // MỚI: đơn lẻ chọn trả ship khi nhận hàng
    mergeShippingCod: row[28] === 'TRUE' || row[28] === true, // MỚI: nhóm gộp chọn trả ship khi nhận hàng
    customerEmail: row[29] || '', // MỚI: Gmail khách để báo mã vận đơn
  };
}
function orderToRow(o) {
  return [
    o.id, o.customerName, o.phone, o.address, o.note || '',
    JSON.stringify(o.items), o.total,
    o.shippingFee || 0,
    o.freeshipApplied || '',
    o.grandTotal || o.total,
    o.status,
    o.paid ? 'TRUE' : 'FALSE',
    o.trackingCode || '',
    o.createdAt,
    o.province || '',
    o.ward || '',
    o.addressDetail || '',
    o.totalWeightGram || 0,
    o.giftWrap ? 'TRUE' : 'FALSE',
    o.giftWrapFee || 0,
    JSON.stringify(o.addOns || []),
    o.addOnsFee || 0,
    o.deliveredAt || '', // MỚI
    o.mergeGroupId != null ? o.mergeGroupId : '', // MỚI: gộp đơn
    o.mergeOrderIds && o.mergeOrderIds.length ? JSON.stringify(o.mergeOrderIds) : '',
    o.mergeShippingFee != null ? o.mergeShippingFee : '',
    o.mergeShippingPaid ? 'TRUE' : 'FALSE',
    o.codShipping ? 'TRUE' : 'FALSE',
    o.mergeShippingCod ? 'TRUE' : 'FALSE',
    o.customerEmail || '' // MỚI
  ];
}

// ---------- Backend: file JSON (dùng khi chưa cấu hình Google Sheets) ----------
function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8'); }

async function fileListOrders() {
  return readJSON(ORDERS_FILE);
}
async function fileAppendOrder(order) {
  const orders = readJSON(ORDERS_FILE);
  orders.push(order);
  writeJSON(ORDERS_FILE, orders);
}
async function fileUpdateOrder(id, patch) {
  const orders = readJSON(ORDERS_FILE);
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], ...patch };
  writeJSON(ORDERS_FILE, orders);
  return orders[idx];
}
// MỚI: xoá 1 đơn khỏi file JSON
async function fileDeleteOrder(id) {
  const orders = readJSON(ORDERS_FILE);
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return false;
  orders.splice(idx, 1);
  writeJSON(ORDERS_FILE, orders);
  return true;
}

// ---------- Backend: Google Sheets ----------
async function sheetListOrders() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  const rows = res.data.values || [];
  // Dòng đầu tiên là tiêu đề cột, bỏ qua
  return rows.slice(1).filter(r => r[0]).map(rowToOrder);
}
// MỚI: SỬA LỖI LỆCH CỘT — trước đây dùng values.append để Google Sheets tự dò xem
// "bảng" đang ở đâu rồi tự chèn dòng mới, nhưng cách này có thể đoán sai cột bắt đầu
// (ghi lệch sang tận cột N thay vì A), khiến trang quản trị đọc cột A (mã đơn) thấy
// trống và báo "Chưa có đơn hàng nào". Giờ đọc trước xem đã có bao nhiêu dòng, rồi ghi
// thẳng (values.update) vào ĐÚNG dòng trống tiếp theo, từ cột A đến T — không còn để
// Google tự đoán vị trí nữa.
async function sheetAppendOrder(order) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  const rows = res.data.values || [];
  const nextRowNumber = rows.length + 1; // dòng 1 là tiêu đề, nên dòng trống tiếp theo = tổng số dòng hiện có + 1
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Orders!A${nextRowNumber}:AD${nextRowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [orderToRow(order)] }
  });
}
async function sheetUpdateOrder(id, patch) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(r => Number(r[0]) === id); // vị trí trong mảng (0 = dòng tiêu đề)
  if (rowIndex === -1) return null;
  const current = rowToOrder(rows[rowIndex]);
  const updated = { ...current, ...patch };
  const sheetRowNumber = rowIndex + 1; // Sheets đánh số dòng bắt đầu từ 1
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Orders!A${sheetRowNumber}:AD${sheetRowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [orderToRow(updated)] }
  });
  return updated;
}
// MỚI: xoá 1 đơn khỏi Google Sheets - xoá sạch nội dung dòng đó (không cần biết
// sheetId/gid của tab), dòng trống sẽ tự bị bỏ qua khi đọc danh sách đơn sau này
async function sheetDeleteOrder(id) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(r => Number(r[0]) === id);
  if (rowIndex === -1) return false;
  const sheetRowNumber = rowIndex + 1;
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `Orders!A${sheetRowNumber}:AD${sheetRowNumber}`,
  });
  return true;
}

// ---------- API dùng chung, server.js chỉ gọi các hàm dưới đây ----------
async function listOrders() {
  return useSheets ? sheetListOrders() : fileListOrders();
}
async function appendOrder(order) {
  return useSheets ? sheetAppendOrder(order) : fileAppendOrder(order);
}
async function updateOrder(id, patch) {
  return useSheets ? sheetUpdateOrder(id, patch) : fileUpdateOrder(id, patch);
}
// MỚI: xoá đơn hàng - dùng chung cho cả 2 cách lưu trữ
async function deleteOrder(id) {
  return useSheets ? sheetDeleteOrder(id) : fileDeleteOrder(id);
}
async function nextOrderId() {
  const orders = await listOrders();
  return orders.length ? Math.max(...orders.map(o => o.id)) + 1 : 1;
}
// MỚI: lấy 1 đơn theo ID - dùng để kiểm tra điều kiện (đã có mã vận đơn chưa...) trước
// khi cho phép khách/admin huỷ đơn hoặc đổi địa chỉ
async function getOrderById(id) {
  const orders = await listOrders();
  return orders.find(o => o.id === Number(id)) || null;
}

module.exports = { listOrders, appendOrder, updateOrder, deleteOrder, nextOrderId, getOrderById, useSheets };

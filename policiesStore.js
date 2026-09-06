// ============================================================
// policiesStore.js
// Lưu nội dung các trang chính sách (Điều khoản sử dụng, Vận chuyển,
// Đổi trả - hoàn tiền, Bảo mật, Phương thức thanh toán) vào Google Sheets
// (tab "Policies" trong CÙNG file Sheet đang dùng để lưu đơn hàng/sản phẩm/
// trang chủ) - để không mất khi Render deploy lại / sleep rồi khởi động lại.
//
// Đây là các trang BẮT BUỘC phải có khi thông báo website với Bộ Công Thương
// (qua online.gov.vn) - thiếu trang nào là hồ sơ hay bị yêu cầu bổ sung nhất.
//
// Nếu CHƯA cấu hình Google Sheets (biến GOOGLE_SHEET_ID/... trong .env),
// tự động dùng lại file policies-content.json như cũ (chỉ để chạy thử trên
// máy - trên Render thật LUÔN cần bật Google Sheets để không mất dữ liệu).
// ============================================================

const fs = require('fs');
const path = require('path');

const POLICIES_FILE = path.join(__dirname, 'policies-content.json');
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

// Tab riêng tên "Policies" trong CÙNG spreadsheet đang lưu đơn hàng/sản phẩm/trang chủ.
// Chỉ có 1 dòng dữ liệu duy nhất: cột A luôn là "content", cột B là toàn bộ
// nội dung 7 trang chính sách dạng JSON (giống hệt cách làm của Homepage).
const SHEET_RANGE = 'Policies!A:B';
const HEADER_ROW = ['Key', 'ValueJSON'];

// Nội dung mặc định - admin vào tab "Chính sách" sửa lại cho đúng với shop của mình
// trước khi nộp hồ sơ thông báo Bộ Công Thương. Đây chỉ là bản mẫu để có sẵn khung.
const DEFAULT_CONTENT = {
  about: {
    title: 'Giới thiệu / Thông tin thương nhân',
    content: 'Tên hộ kinh doanh/doanh nghiệp: [Điền đúng theo Giấy chứng nhận đăng ký kinh doanh]\nMã số thuế/Mã hộ kinh doanh: [Điền mã số]\nĐịa chỉ kinh doanh: [Điền địa chỉ đăng ký kinh doanh]\nNgành nghề kinh doanh: Bán lẻ hàng thủ công (keyring handmade, blindbox) qua mạng\n\nGift Lab là shop chuyên bán các sản phẩm keyring handmade tự thiết kế và blindbox (Baby Three, Popmart...), phục vụ khách hàng trên toàn quốc qua website và các kênh mạng xã hội.\n\n⚠️ Lưu ý: thông tin thương nhân ở mục này PHẢI khớp chính xác với Giấy chứng nhận đăng ký kinh doanh khi nộp hồ sơ thông báo với Bộ Công Thương.'
  },
  terms: {
    title: 'Điều khoản sử dụng',
    content: 'Khi truy cập và đặt hàng trên website Gift Lab, khách hàng đồng ý với các điều khoản sau:\n\n1. Thông tin sản phẩm (hình ảnh, giá, mô tả) được cập nhật chính xác nhất có thể, tuy nhiên có thể chênh lệch nhẹ so với thực tế do đặc thù hàng thủ công.\n2. Đơn hàng được xác nhận sau khi shop liên hệ lại với khách hoặc khách hoàn tất thanh toán.\n3. Shop có quyền từ chối đơn hàng trong trường hợp hết hàng hoặc thông tin đặt hàng không hợp lệ.\n4. Mọi tranh chấp phát sinh sẽ được ưu tiên giải quyết thông qua thương lượng trực tiếp giữa hai bên.'
  },
  shipping: {
    title: 'Chính sách vận chuyển - giao nhận',
    content: 'Đơn hàng được đóng gói và gửi qua đơn vị vận chuyển SPX Express.\n\n1. Thời gian xử lý đơn: 1-2 ngày làm việc kể từ khi đơn được xác nhận.\n2. Thời gian giao hàng dự kiến: 2-5 ngày tùy khu vực.\n3. Phí vận chuyển được tính tự động theo cân nặng và địa chỉ nhận hàng, hiển thị rõ trước khi khách xác nhận đặt hàng.\n4. Khách hàng vui lòng kiểm tra kỹ thông tin người nhận (họ tên, số điện thoại, địa chỉ) trước khi đặt hàng để tránh thất lạc.'
  },
  returns: {
    title: 'Chính sách đổi trả - hoàn tiền',
    content: 'Shop hỗ trợ đổi/trả trong các trường hợp sau:\n\n1. Sản phẩm giao sai mẫu, sai số lượng so với đơn đặt.\n2. Sản phẩm bị lỗi, hư hỏng do quá trình vận chuyển (cần quay video mở hàng làm bằng chứng).\n3. Thời hạn yêu cầu đổi/trả: trong vòng 24-48 giờ kể từ khi nhận hàng.\n4. Chi phí vận chuyển đổi/trả do lỗi từ phía shop sẽ được shop hỗ trợ; trường hợp đổi ý không do lỗi sản phẩm, khách hàng chịu phí vận chuyển hai chiều.\n5. Hoàn tiền được thực hiện qua chuyển khoản trong vòng 3-5 ngày làm việc sau khi xác nhận yêu cầu hợp lệ.'
  },
  privacy: {
    title: 'Chính sách bảo mật thông tin',
    content: 'Gift Lab cam kết bảo mật thông tin cá nhân của khách hàng.\n\n1. Thông tin thu thập (họ tên, số điện thoại, địa chỉ) chỉ được sử dụng để xử lý và giao đơn hàng.\n2. Thông tin khách hàng không được chia sẻ cho bên thứ ba, trừ đơn vị vận chuyển (để giao hàng) hoặc khi có yêu cầu từ cơ quan nhà nước có thẩm quyền.\n3. Khách hàng có quyền yêu cầu chỉnh sửa hoặc xóa thông tin cá nhân đã cung cấp bằng cách liên hệ trực tiếp với shop.'
  },
  payment: {
    title: 'Phương thức thanh toán',
    content: 'Shop hỗ trợ các hình thức thanh toán sau:\n\n1. Chuyển khoản ngân hàng trước khi giao hàng.\n2. Thanh toán khi nhận hàng (COD) tùy khu vực và chính sách áp dụng theo từng thời điểm.\n\nMọi giao dịch chuyển khoản đều được shop xác nhận và thông báo lại cho khách hàng trước khi tiến hành đóng gói, gửi hàng.'
  },
  contact: {
    title: 'Liên hệ',
    content: 'Mọi thắc mắc về đơn hàng, sản phẩm hoặc chính sách, khách hàng vui lòng liên hệ shop qua:\n\nSố điện thoại/Zalo: [Điền số điện thoại]\nEmail: [Điền email]\nFanpage/Facebook: [Điền link Fanpage]\nĐịa chỉ: [Điền địa chỉ liên hệ, có thể trùng địa chỉ kinh doanh]\n\nThời gian phản hồi: trong vòng 24 giờ (trừ ngày lễ, Tết).'
  }
};

// ---------- Backend: file JSON (chỉ dùng khi chưa cấu hình Google Sheets) ----------
function fileGetContent() {
  if (!fs.existsSync(POLICIES_FILE)) return DEFAULT_CONTENT;
  return { ...DEFAULT_CONTENT, ...JSON.parse(fs.readFileSync(POLICIES_FILE, 'utf-8')) };
}
function fileSaveContent(data) {
  fs.writeFileSync(POLICIES_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------- Backend: Google Sheets ----------
async function sheetGetContent() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  const rows = res.data.values || [];
  const dataRow = rows.find(r => r[0] === 'content');
  if (!dataRow || !dataRow[1]) return DEFAULT_CONTENT;
  try {
    return { ...DEFAULT_CONTENT, ...JSON.parse(dataRow[1]) };
  } catch (e) {
    console.error('Lỗi đọc JSON nội dung chính sách từ Sheet:', e.message);
    return DEFAULT_CONTENT;
  }
}
async function sheetSaveContent(data) {
  const sheets = await getSheetsClient();
  const values = [HEADER_ROW, ['content', JSON.stringify(data)]];
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: SHEET_RANGE });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'Policies!A1',
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

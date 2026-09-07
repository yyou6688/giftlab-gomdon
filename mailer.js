// ============================================================
// mailer.js
// Gửi email (báo có đơn mới/thanh toán + báo khách khi có mã vận đơn) qua Brevo API.
//
// TẠI SAO ĐỔI SANG BREVO (thay vì Gmail SMTP như bản trước):
// Trên Render, kết nối SMTP (cổng 465/587) ra ngoài hay bị "Connection timeout"/bị
// Google âm thầm chặn sau vài tiếng, dù cấu hình đúng App Password - vì Google phát
// hiện đăng nhập từ IP trung tâm dữ liệu (không phải máy quen thuộc). Brevo gửi qua
// API HTTPS (giống gọi 1 API bình thường) nên không bị chặn kiểu này, ổn định lâu dài.
//
// Cần khai báo trên Render (Settings > Environment):
//   BREVO_API_KEY = API key lấy trong Brevo (Settings > SMTP & API > API Keys)
//   GMAIL_USER    = giftlabbyu@gmail.com    (hộp mail chủ shop NHẬN thông báo đơn mới -
//                   giữ nguyên tên biến GMAIL_USER như code cũ để không phải đổi chỗ khác)
//   EMAIL_SENDER  = donhang@giftlabbyu.shop (địa chỉ GỬI đi - domain đã xác thực trong Brevo,
//                   dùng CHUNG với web chính giftlab-shop, không cần xác thực lại)
// Tuỳ chọn thêm:
//   NOTIFY_EMAIL  = địa chỉ NHẬN thông báo (để trống = gửi về chính GMAIL_USER)
//
// Nếu CHƯA khai báo đủ BREVO_API_KEY + GMAIL_USER, mọi lời gọi sendNotifyEmail()/
// sendTrackingEmailToCustomer() sẽ chỉ log ra console, không báo lỗi làm hỏng luồng
// đặt hàng/thanh toán/gắn mã vận đơn.
// ============================================================

const https = require('https');

const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const GMAIL_USER = process.env.GMAIL_USER || '';
// MỚI: địa chỉ gửi đi dùng domain riêng đã xác thực (chung với web giftlab-shop chính) -
// nếu chưa khai báo thì tạm dùng lại GMAIL_USER để không bị gãy nếu quên thêm biến.
const EMAIL_SENDER = process.env.EMAIL_SENDER || GMAIL_USER;
const enabled = Boolean(BREVO_API_KEY && GMAIL_USER);

if (!enabled) {
  console.log('[mailer] Chưa cấu hình BREVO_API_KEY/GMAIL_USER - sẽ KHÔNG gửi email');
}

// Gửi 1 email qua Brevo API - tự bắt lỗi bên trong, KHÔNG throw ra ngoài, để không
// làm hỏng luồng chính (đặt đơn / xác nhận thanh toán / gắn mã vận đơn).
function sendViaBrevo({ to, subject, text }) {
  return new Promise((resolve) => {
    if (!enabled) return resolve();
    const payload = JSON.stringify({
      sender: { name: 'Gift Lab', email: EMAIL_SENDER },
      to: [{ email: to }],
      subject,
      // MỚI: Brevo cần htmlContent - bọc text thường lại, giữ xuống dòng (\n -> <br>)
      htmlContent: `<pre style="font-family:inherit; white-space:pre-wrap;">${escapeHtml(text)}</pre>`
    });
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 15000
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.error(`[mailer] Gửi email qua Brevo thất bại (status ${res.statusCode}):`, body);
        }
        resolve();
      });
    });
    req.on('timeout', () => { req.destroy(); console.error('[mailer] Gửi email qua Brevo: hết thời gian chờ'); resolve(); });
    req.on('error', (err) => { console.error('[mailer] Gửi email qua Brevo thất bại:', err.message); resolve(); });
    req.write(payload);
    req.end();
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Gửi 1 email báo cho CHỦ SHOP (đơn mới / đã thanh toán...) - giữ nguyên chữ ký hàm
// (subject, text) như bản cũ để không phải sửa gì ở server.js.
async function sendNotifyEmail(subject, text) {
  if (!enabled) {
    console.log('[mailer] Chưa cấu hình BREVO_API_KEY/GMAIL_USER, bỏ qua gửi mail:', subject);
    return;
  }
  const to = process.env.NOTIFY_EMAIL || GMAIL_USER;
  await sendViaBrevo({ to, subject, text });
}

// Gửi email TRỰC TIẾP CHO KHÁCH khi đơn được gắn mã vận đơn - giữ nguyên chữ ký hàm
// (order) như bản cũ để không phải sửa gì ở server.js.
async function sendTrackingEmailToCustomer(order) {
  if (!enabled) {
    console.log('[mailer] Chưa cấu hình BREVO_API_KEY/GMAIL_USER, bỏ qua gửi mail báo khách:', order.customerEmail);
    return;
  }
  if (!order.customerEmail) {
    console.log(`[mailer] Đơn DH${order.id} không có Gmail khách, bỏ qua gửi mail báo khách.`);
    return;
  }
  const productLines = (order.items || [])
    .map(i => `- ${i.name}${i.variantName ? ' (' + i.variantName + ')' : ''} x${i.qty}`)
    .join('\n');
  const trackUrl = 'https://spx.vn/track';
  const text =
    `Chào ${order.customerName},\n\n` +
    `Đơn hàng của bạn tại Gift Lab - by U, for You đã được gửi đi qua SPX Express.\n\n` +
    `Mã đơn: DH${order.id}\n` +
    `Sản phẩm:\n${productLines}\n` +
    `Tổng tiền: ${(order.grandTotal || order.total || 0).toLocaleString('vi-VN')}đ\n\n` +
    `Mã vận đơn: ${order.trackingCode}\n` +
    `Tra cứu hành trình đơn hàng tại: ${trackUrl} (dán mã vận đơn vào ô tra cứu)\n\n` +
    `Cảm ơn bạn đã ủng hộ Gift Lab, mong bạn sẽ thích sản phẩm nhé!\n` +
    `Có gì cần hỗ trợ, nhắn mình qua Facebook hoặc Zalo.\n\n` +
    `— Gift Lab, by U for You`;
  await sendViaBrevo({
    to: order.customerEmail,
    subject: `Gift Lab đã gửi hàng cho bạn — Mã vận đơn ${order.trackingCode}`,
    text
  });
}

module.exports = { sendNotifyEmail, sendTrackingEmailToCustomer };

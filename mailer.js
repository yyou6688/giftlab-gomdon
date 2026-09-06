// ============================================================
// mailer.js
// Gửi email báo (đơn mới / đã thanh toán) qua Gmail, dùng App Password
// (miễn phí, không giới hạn số lượng đáng kể cho quy mô shop nhỏ).
//
// Cần 2 biến môi trường trong .env:
//   GMAIL_USER = địa chỉ Gmail dùng để gửi (VD: giftlabbyu@gmail.com)
//   GMAIL_APP_PASSWORD = mật khẩu ứng dụng 16 ký tự tạo trong Google Account
// Tuỳ chọn thêm:
//   NOTIFY_EMAIL = địa chỉ Gmail NHẬN thông báo (để trống = gửi về chính GMAIL_USER)
//
// Nếu chưa cấu hình đủ, mọi lời gọi sendNotifyEmail() sẽ chỉ log ra console
// thay vì báo lỗi làm hỏng luồng đặt hàng/thanh toán.
// ============================================================

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return transporter;
}

// Gửi 1 email báo - KHÔNG throw lỗi ra ngoài, chỉ log, để không làm hỏng
// luồng chính (đặt đơn / xác nhận thanh toán) nếu Gmail lỗi hoặc chưa cấu hình.
async function sendNotifyEmail(subject, text) {
  const t = getTransporter();
  if (!t) {
    console.log('[mailer] Chưa cấu hình GMAIL_USER/GMAIL_APP_PASSWORD, bỏ qua gửi mail:', subject);
    return;
  }
  const to = process.env.NOTIFY_EMAIL || process.env.GMAIL_USER;
  try {
    await t.sendMail({
      from: `Gift Lab <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text,
    });
  } catch (err) {
    console.error('[mailer] Gửi email thất bại:', err.message);
  }
}

// MỚI: gửi email TRỰC TIẾP CHO KHÁCH (khác sendNotifyEmail ở trên, vốn luôn gửi
// về Gmail của shop). Dùng khi đơn được gắn mã vận đơn, để báo khách đã gửi hàng.
// Cũng không throw lỗi ra ngoài - Gmail lỗi/chưa cấu hình thì chỉ log, không làm
// hỏng luồng lưu mã vận đơn của admin.
async function sendTrackingEmailToCustomer(order) {
  const t = getTransporter();
  if (!t) {
    console.log('[mailer] Chưa cấu hình GMAIL_USER/GMAIL_APP_PASSWORD, bỏ qua gửi mail báo khách:', order.customerEmail);
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
  try {
    await t.sendMail({
      from: `Gift Lab <${process.env.GMAIL_USER}>`,
      to: order.customerEmail,
      subject: `Gift Lab đã gửi hàng cho bạn — Mã vận đơn ${order.trackingCode}`,
      text:
        `Chào ${order.customerName},\n\n` +
        `Đơn hàng của bạn tại Gift Lab - by U, for You đã được gửi đi qua SPX Express.\n\n` +
        `Mã đơn: DH${order.id}\n` +
        `Sản phẩm:\n${productLines}\n` +
        `Tổng tiền: ${(order.grandTotal || order.total || 0).toLocaleString('vi-VN')}đ\n\n` +
        `Mã vận đơn: ${order.trackingCode}\n` +
        `Tra cứu hành trình đơn hàng tại: ${trackUrl} (dán mã vận đơn vào ô tra cứu)\n\n` +
        `Cảm ơn bạn đã ủng hộ Gift Lab, mong bạn sẽ thích sản phẩm nhé!\n` +
        `Có gì cần hỗ trợ, nhắn mình qua Facebook hoặc Zalo.\n\n` +
        `— Gift Lab, by U for You`,
    });
  } catch (err) {
    console.error(`[mailer] Gửi email báo khách cho DH${order.id} thất bại:`, err.message);
  }
}

module.exports = { sendNotifyEmail, sendTrackingEmailToCustomer };

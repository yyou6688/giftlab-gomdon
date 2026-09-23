// ============================================================
// rateLimiter.js
// Giới hạn số lần 1 địa chỉ IP được gọi vào 1 nhóm API trong 1 khoảng thời gian -
// chặn script tự động gọi hàng loạt (dò số điện thoại, thử mã xác nhận, spam đơn...).
// Tự viết tay (không cần cài thêm package), lưu tạm trong bộ nhớ - giống cách lockQueue.js
// đang làm. Chỉ đúng khi server chạy 1 tiến trình (đúng với cách app đang chạy trên Render).
// ============================================================

const buckets = new Map(); // key: "routeKey:IP" -> { count, windowStart }

// MỚI: dọn rác định kỳ - tránh Map phình to mãi nếu chạy server rất lâu không restart
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now - entry.windowStart > 30 * 60 * 1000) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

// Tạo middleware giới hạn: tối đa "maxRequests" lần gọi trong "windowMs" mili-giây,
// tính riêng theo từng địa chỉ IP.
function rateLimit(routeKey, maxRequests, windowMs) {
  return (req, res, next) => {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
    const key = `${routeKey}:${ip}`;
    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      return next();
    }
    entry.count++;
    if (entry.count > maxRequests) {
      return res.status(429).json({ error: 'Bạn thao tác hơi nhanh, vui lòng đợi vài phút rồi thử lại giúp mình nhé.' });
    }
    next();
  };
}

module.exports = { rateLimit };

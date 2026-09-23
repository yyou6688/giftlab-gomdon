// ============================================================
// lockQueue.js
// Hàng đợi khoá (mutex) đơn giản, đảm bảo các thao tác GHI dữ liệu quan
// trọng (tạo đơn, huỷ đơn, trừ/hoàn kho...) chạy LẦN LƯỢT từng cái một,
// không bao giờ chạy chồng lên nhau - kể cả khi 2-3 khách bấm đặt hàng
// gần như cùng lúc.
//
// TẠI SAO CẦN FILE NÀY:
// Dữ liệu đang lưu ở file JSON / Google Sheets đều theo kiểu "đọc hết ->
// sửa -> ghi lại hết". Nếu 2 request chạy đúng lúc gần nhau, cả 2 có thể
// cùng đọc dữ liệu ở trạng thái CŨ, rồi request ghi SAU sẽ ghi đè mất kết
// quả của request ghi TRƯỚC - có thể làm MẤT 1 đơn hàng hoặc trừ kho SAI.
// Xếp hàng chạy tuần tự sẽ loại bỏ hoàn toàn tình huống này.
//
// CHỈ hoạt động đúng khi server chạy 1 tiến trình (1 instance) - đúng với
// cách app này đang chạy trên Render. Nếu sau này scale ra nhiều instance
// chạy song song thì cần đổi sang khoá ở tầng dữ liệu (VD: database thật),
// nhưng với quy mô shop hiện tại thì cách này là đủ và không tốn thêm chi phí.
// ============================================================

const queues = new Map();

// Chạy 1 hàm bất đồng bộ (fn) trong hàng đợi ứng với "key" - nếu đang có
// việc khác cùng key chạy dở, việc mới sẽ tự đợi đến lượt mới bắt đầu chạy.
// Dùng CÙNG 1 key cho mọi thao tác đụng chạm tới cùng 1 dữ liệu (đơn hàng +
// tồn kho sản phẩm) để đảm bảo chúng không bao giờ xen kẽ nhau.
function withLock(key, fn) {
  const previous = queues.get(key) || Promise.resolve();
  const run = previous.then(() => fn());
  // "next" luôn resolve (kể cả khi fn() lỗi) để hàng đợi không bị kẹt mãi mãi
  // vì 1 lỗi ở việc trước đó - lỗi thật vẫn được ném ra đúng chỗ gọi withLock().
  const next = run.then(() => {}, () => {});
  queues.set(key, next);
  return run;
}

module.exports = { withLock };

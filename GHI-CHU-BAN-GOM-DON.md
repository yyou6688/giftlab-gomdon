# Bản "Gom đơn" — khác gì so với giftlab-shop gốc

Bản này rút gọn từ `giftlab-shop` để làm công cụ đặt đơn + quản lý kho vận
cho từng đợt gom hàng handmade, KHÔNG dùng làm website bán hàng chính.

## Đã ẩn (không xoá, có thể bật lại)
- 4 tab quản trị: Trang chủ, Khuyến mãi, Flash Sale, Chính sách
  (bỏ comment trong `public/admin.html` để bật lại)
- Banner, dải bộ sưu tập theo danh mục, sidebar danh mục bên trái trên trang chủ
  (bỏ `style="display:none;"` trong `public/index.html` để bật lại)

## Đã thêm mới
- Ô Gmail bắt buộc trong form đặt hàng (`public/js/shop.js`)
- Cột `CustomerEmail` trong Google Sheets đơn hàng (`ordersStore.js`, cột AD)
- Hàm `sendTrackingEmailToCustomer` gửi email trực tiếp cho khách khi có mã vận đơn
  (`mailer.js`), được gọi tự động khi lưu mã vận đơn — cả lưu tay từng đơn lẫn
  nhập Excel hàng loạt (`server.js`)
- Nút "🔗 Chia sẻ" trong tab Sản phẩm: sinh link `/?p=<mã sản phẩm>` + mã QR
  (thư viện QRious, tạo ngay trên trình duyệt) để đăng lên mạng xã hội
- Trang chủ tự mở đúng sản phẩm khi khách vào link/quét mã QR có `?p=`
  (`openSharedProductFromUrl` trong `public/js/shop.js`)

## Đã rút gọn
- `data/products.json`: giữ ngẫu nhiên 5 sản phẩm mẫu (thay vì 199) —
  sản phẩm thật cho từng đợt gom, bạn tự đăng thêm trong tab Sản phẩm

## Đã thêm mới (đợt 2 - kết nối với công cụ Tách đơn SPX)
- Cột `Source` trong Google Sheets đơn hàng (`ordersStore.js`, cột AE) - đánh dấu
  "website" (khách tự đặt) hay "tach-don" (đẩy từ công cụ tách đơn Messenger)
- Endpoint `POST /api/orders/import` (`server.js`, cần header `x-admin-key`) - nhận
  đơn được đẩy từ công cụ tách đơn (file `tach-don-spx.html` riêng, không nằm
  trong project này) vào chung tab Đơn hàng
- Bộ lọc "Nguồn đơn" + nhãn "Tách đơn" trên mỗi đơn trong tab Đơn hàng (`admin.js`)
- File `.env`: BANK_ID/BANK_ACCOUNT/BANK_ACCOUNT_NAME dùng cho công cụ tách đơn
  cần khớp với tài khoản đã hardcode trong `tach-don-spx.html`
  (970415 / 109871420470 / DO THI VIET ANH - VietinBank)

## Giữ nguyên 100%, không đổi
- Toàn bộ luồng giỏ hàng, đặt hàng, mã QR chuyển khoản của khách
- Tab Đơn hàng, Sản phẩm, Vận chuyển trong trang quản trị
- Xuất Excel lên đơn SPX (`exportSpxExcel`) và nhập mã vận đơn hàng loạt
  (`handleTrackingExcelUpload`) — đã có sẵn từ bản gốc, không viết lại

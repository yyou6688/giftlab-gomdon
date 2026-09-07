# Gift Lab Shop

Website bán hàng đầy đủ cho **Gift Lab — By U, for You**: khách tự xem sản phẩm, thêm giỏ hàng, đặt hàng trực tiếp. Đã nạp sẵn **199 sản phẩm thật** lấy từ file xuất Shopee của shop `giftlabbyu` (bút dao unboxing, blindbox, mô hình mini, móc khoá, khung ảnh/standee, phụ kiện khác), kèm ảnh thật và giá theo từng phân loại.

## Cấu trúc dự án

```
giftlab-shop/
├── server.js
├── package.json
├── .env.example            # Đổi tên thành .env, chỉnh mật khẩu admin + thông tin ngân hàng
├── data/
│   ├── products.json       # 199 sản phẩm thật, có ảnh + nhiều phân loại/giá
│   └── orders.json
└── public/
    ├── index.html
    ├── admin.html
    ├── images/logo.png     # Logo Gift Lab
    ├── css/style.css       # Màu tím pastel #b2a6e8, font Maven Pro
    └── js/
        ├── shop.js
        └── admin.js
```

## Cách chạy thử trên máy

1. Cài Node.js (bản 18 trở lên) nếu máy chưa có.
2. Mở terminal tại thư mục `giftlab-shop`, chạy: `npm install`
3. Đổi tên file `.env.example` thành `.env`, chỉnh `ADMIN_KEY` và thông tin ngân hàng nếu cần.
4. Chạy: `npm start`
5. Mở trình duyệt:
   - Trang khách: `http://localhost:3000/`
   - Trang quản trị: `http://localhost:3000/admin.html`

## Về luồng thanh toán

Sau khi đặt hàng, khách sẽ thấy mã QR chuyển khoản (VietQR) ngay lập tức kèm lời cảm ơn — đây là **xác nhận thủ công**: bạn tự kiểm tra tin nhắn ngân hàng rồi vào trang quản trị tick "Đã nhận tiền" cho đúng đơn. Không có bước tự động kiểm tra thanh toán.

## Về sản phẩm đã nạp

- 199 sản phẩm được gộp từ file `mass_update_sales_info` (giá, tồn kho, phân loại) và `mass_update_media_info` (ảnh bìa) do Shopee xuất ra.
- Nhiều sản phẩm có **nhiều phân loại** (ví dụ: bút dao có 5-6 màu/kiểu khác giá nhau) — khách bấm vào sản phẩm sẽ được chọn đúng phân loại trước khi thêm giỏ hàng.
- Trang quản trị cho sửa giá/tồn kho từng phân loại, nhưng với gần 200 sản phẩm việc sửa hàng loạt vẫn nên làm trên Shopee rồi xuất file mới, gửi lại để cập nhật `products.json`.
- Phân loại danh mục (bút dao / blindbox / mô hình / móc khoá / khung ảnh / khác) được máy tự đoán theo tên sản phẩm — có thể có vài sản phẩm bị xếp sai nhóm, sửa tay trong `data/products.json` nếu cần.

## Đưa lên host thật

Ứng dụng Node.js thông thường, chạy được trên Render, Railway, hoặc VPS riêng. Thư mục `data/` cần ổ đĩa lưu lâu dài — một số host miễn phí xóa file mỗi lần deploy lại, nên hỏi kỹ trước khi chọn gói.

## Việc cần làm tiếp

- [ ] Thêm ảnh cho các sản phẩm chưa có ảnh thật (nếu có)
- [ ] Rà lại phân loại danh mục cho chính xác hơn
- [ ] Khi cần, thiết lập xác nhận thanh toán tự động qua SePay/Casso (đã trao đổi trước đó, có thể làm lại khi web đã lên host thật)
- [ ] Cập nhật tồn kho định kỳ khi bán trên Shopee song song


// shippingCalculator.js
// Module tính phí vận chuyển dựa trên TỔNG CÂN NẶNG của giỏ hàng.
// Cân nặng lấy theo TỪNG SẢN PHẨM/PHÂN LOẠI (nhập trong trang quản trị,
// mục "Sửa giá/kho/ảnh" của từng sản phẩm) — sản phẩm nào chưa nhập
// cân nặng riêng sẽ tự dùng "defaultWeightGram" trong cấu hình ship.
//
// Toàn bộ cấu hình ship (cân nặng mặc định, mốc phí, quy tắc freeship)
// giờ chỉnh được trực tiếp trong trang quản trị, tab "Vận chuyển" —
// không cần sửa file này hay sửa tay trên GitHub nữa.
//
// MỚI: cấu hình ship giờ lưu qua Google Sheets (shippingConfigStore.js)
// thay vì đọc/ghi trực tiếp file JSON, để không mất khi Render sleep rồi
// khởi động lại container. Vì đọc từ Google Sheets bắt buộc phải là bất
// đồng bộ, loadShippingConfig/saveShippingConfig/calculateShippingFee đều
// đổi thành hàm async — nơi nào gọi các hàm này cần thêm "await".
const shippingConfigStore = require('./shippingConfigStore');

// MỚI: bộ mốc phí "dự phòng" - chỉ dùng tạm khi cấu hình ship trong trang quản trị (tab
// Vận chuyển) bị thiếu hoặc lỡ xoá hết mốc phí, để website vẫn tính được phí ship và nhận
// đơn bình thường thay vì bị lỗi ngừng nhận đơn hoàn toàn. Không đụng gì tới cấu hình thật
// đang lưu trên Google Sheets/file - admin vào tab Vận chuyển cấu hình lại là dùng đúng ý
// mình ngay, bộ mốc mặc định này chỉ là "lưới an toàn" tạm thời.
const FALLBACK_WEIGHT_TIERS = [
  { maxWeightGram: 500, fee: 20000 },
  { maxWeightGram: 1000, fee: 30000 },
  { maxWeightGram: 2000, fee: 45000 }
];
const FALLBACK_EXTRA_FEE_PER_KG = 15000;

async function loadShippingConfig() {
  return shippingConfigStore.getConfig();
}
// MỚI: lưu lại cấu hình ship mới do admin chỉnh trong trang quản trị
async function saveShippingConfig(config) {
  return shippingConfigStore.saveConfig(config);
}

function calculateTotalWeight(cartItems, defaultWeightGram) {
  return cartItems.reduce((sum, item) => {
    const unitWeight = (item.weight !== undefined && item.weight !== null && item.weight > 0)
      ? item.weight
      : defaultWeightGram;
    return sum + unitWeight * item.quantity;
  }, 0);
}

async function calculateShippingFee(cartItems, orderTotal) {
  const config = await loadShippingConfig();
  const defaultWeightGram = config.defaultWeightGram || 500;
  const totalWeightGram = calculateTotalWeight(cartItems, defaultWeightGram);
  let fee = null;

  // MỚI: phòng trường hợp tab Vận chuyển bị thiếu/xoá hết mốc phí - tự động dùng tạm bộ
  // mốc mặc định thay vì để lỗi làm đứng hình cả website. Ghi log cảnh báo rõ để admin
  // biết mà vào cấu hình lại sớm (không phải lỗi chỉ xảy ra 1 lần rồi im lặng luôn).
  let weightTiers = Array.isArray(config.weightTiers) ? config.weightTiers : [];
  let extraFeePerKgAboveMax = config.extraFeePerKgAboveMax;
  if (weightTiers.length === 0) {
    console.error('CẢNH BÁO: chưa cấu hình mốc phí vận chuyển (trang quản trị > tab Vận chuyển) - đang tạm dùng mốc phí mặc định để không làm gián đoạn việc nhận đơn. Vào trang quản trị cấu hình lại sớm giúp mình.');
    weightTiers = FALLBACK_WEIGHT_TIERS;
  }
  if (!extraFeePerKgAboveMax) extraFeePerKgAboveMax = FALLBACK_EXTRA_FEE_PER_KG;

  const sortedTiers = [...weightTiers].sort((a, b) => a.maxWeightGram - b.maxWeightGram);
  for (const tier of sortedTiers) {
    if (totalWeightGram <= tier.maxWeightGram) {
      fee = tier.fee;
      break;
    }
  }
  if (fee === null) {
    const topTier = sortedTiers[sortedTiers.length - 1];
    const extraGram = totalWeightGram - topTier.maxWeightGram;
    const extraKg = Math.ceil(extraGram / 1000);
    fee = topTier.fee + extraKg * extraFeePerKgAboveMax;
  }
  // MỚI: mỗi quy tắc giờ có thể gồm NHIỀU danh mục, mỗi danh mục 1 ngưỡng giá riêng
  // (rule.targets = [{category, minOrderValue}, ...]). Chỉ cần khớp ĐÚNG 1 trong các
  // danh mục đó (đạt ngưỡng riêng của danh mục đó) là cả đơn được freeship theo quy tắc này.
  // Vẫn đọc được định dạng cũ (rule.category + rule.minOrderValue, chỉ 1 danh mục) để
  // không hỏng dữ liệu đã lưu trước đây.
  for (const rule of (config.freeshipRules || [])) { // MỚI: phòng thêm trường hợp freeshipRules bị thiếu/undefined
    if (!rule.active) continue;
    const targets = rule.targets && rule.targets.length ? rule.targets : [{ category: rule.category, minOrderValue: rule.minOrderValue }];
    const matched = targets.some((t) => {
      if (t.category === 'all') return orderTotal >= t.minOrderValue;
      const categoryTotal = cartItems
        .filter((item) => item.category === t.category)
        .reduce((sum, item) => sum + item.price * item.quantity, 0);
      return categoryTotal >= t.minOrderValue;
    });
    if (matched) {
      return { fee: 0, freeshipApplied: rule.label, totalWeightGram };
    }
  }
  return { fee, freeshipApplied: null, totalWeightGram };
}

module.exports = { calculateShippingFee, loadShippingConfig, saveShippingConfig };

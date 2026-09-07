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
  const sortedTiers = [...config.weightTiers].sort((a, b) => a.maxWeightGram - b.maxWeightGram);
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
    fee = topTier.fee + extraKg * config.extraFeePerKgAboveMax;
  }
  // MỚI: mỗi quy tắc giờ có thể gồm NHIỀU danh mục, mỗi danh mục 1 ngưỡng giá riêng
  // (rule.targets = [{category, minOrderValue}, ...]). Chỉ cần khớp ĐÚNG 1 trong các
  // danh mục đó (đạt ngưỡng riêng của danh mục đó) là cả đơn được freeship theo quy tắc này.
  // Vẫn đọc được định dạng cũ (rule.category + rule.minOrderValue, chỉ 1 danh mục) để
  // không hỏng dữ liệu đã lưu trước đây.
  for (const rule of config.freeshipRules) {
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

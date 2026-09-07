// ============================================================
// promoUtils.js
// Logic tính toán dùng chung cho chương trình khuyến mãi: xác định chương trình nào
// đang "sống" (đang diễn ra), tìm sản phẩm/SKU có tham gia không, tính giá sau giảm,
// và tính giới hạn số lượng được mua theo 1 số điện thoại.
// ============================================================

// Chương trình đang thực sự diễn ra: chưa bị kết thúc sớm, và thời gian hiện tại nằm
// trong khoảng bắt đầu - kết thúc đã đặt.
function isPromotionActive(promo, now) {
  now = now || new Date();
  if (!promo || promo.endedEarly) return false;
  const start = promo.startAt ? new Date(promo.startAt) : null;
  const end = promo.endAt ? new Date(promo.endAt) : null;
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

// Tìm chương trình + mục sản phẩm đang khuyến mãi cho 1 productId (chương trình đang
// diễn ra sớm nhất được ưu tiên nếu trùng nhiều chương trình - trường hợp hiếm gặp)
function findActivePromoItem(promotions, productId, now) {
  now = now || new Date();
  for (const promo of (promotions || [])) {
    if (!isPromotionActive(promo, now)) continue;
    const item = (promo.items || []).find(i => i.productId === String(productId));
    if (item) return { promo, item };
  }
  return null;
}

// Ghép giá trị giảm áp dụng cho 1 SKU cụ thể: ưu tiên override riêng theo SKU, nếu
// không có thì dùng theo mức chung của cả sản phẩm trong chương trình.
function resolveVariantDiscount(item, variantIndex) {
  const override = item.variantOverrides && item.variantOverrides[String(variantIndex)];
  return {
    discountType: (override && override.discountType) || item.discountType || 'percent',
    discountValue: (override && override.discountValue != null) ? override.discountValue : (item.discountValue || 0),
  };
}
function resolveVariantLimit(item, variantIndex) {
  const override = item.variantOverrides && item.variantOverrides[String(variantIndex)];
  if (override && override.limitPerPhone != null && override.limitPerPhone !== '') return Number(override.limitPerPhone);
  if (item.limitPerPhone != null && item.limitPerPhone !== '') return Number(item.limitPerPhone);
  return null; // không giới hạn
}

function calcDiscountedPrice(basePrice, discountType, discountValue) {
  if (!discountValue) return basePrice;
  if (discountType === 'percent') {
    return Math.max(0, Math.round(basePrice * (1 - discountValue / 100)));
  }
  return Math.max(0, basePrice - discountValue);
}

module.exports = { isPromotionActive, findActivePromoItem, resolveVariantDiscount, resolveVariantLimit, calcDiscountedPrice };

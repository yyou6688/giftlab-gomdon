// ============================================================
// BeanBox Shop - server.js
// Backend đơn giản: Express + lưu dữ liệu vào file JSON.
// Không cần cài database ngoài - phù hợp cho shop nhỏ, dễ host.
// Khi lượng đơn hàng lớn lên, có thể thay JSON bằng SQLite/MongoDB
// mà không cần đổi cấu trúc API phía dưới.
// ============================================================

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const ordersStore = require('./ordersStore');
const productsStore = require('./productsStore'); // MỚI: sản phẩm giờ lưu Google Sheets, không mất khi deploy lại
const homepageStore = require('./homepageStore'); // MỚI: trang chủ giờ lưu Google Sheets, không mất khi deploy lại
const policiesStore = require('./policiesStore'); // MỚI: các trang chính sách (điều khoản, vận chuyển, đổi trả, bảo mật, thanh toán) lưu Google Sheets
const emailNotify = require('./emailNotify'); // MỚI: gửi email báo chủ shop khi có đơn hàng mới (Gmail SMTP)
const categoriesStore = require('./categoriesStore'); // MỚI: danh mục giờ lưu Google Sheets, không mất khi deploy lại
const promotionsStore = require('./promotionsStore'); // MỚI: chương trình khuyến mãi lưu Google Sheets, không mất khi deploy lại
const flashSalesStore = require('./flashSalesStore'); // MỚI: chương trình Flash Sale, lưu riêng (Google Sheets tab "FlashSales")
const promoUtils = require('./promoUtils'); // MỚI: logic tính giá/giới hạn khuyến mãi + flash sale dùng chung (2 loại cùng cấu trúc)
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
// Module tính phí ship (dựa trên cân nặng từng sản phẩm)
const { calculateShippingFee, loadShippingConfig, saveShippingConfig } = require('./shippingCalculator');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // tối đa 5MB mỗi ảnh
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Chỉ nhận file ảnh'));
    cb(null, true);
  }
});

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'beanbox2026';
const BANK_ID = process.env.BANK_ID || '';
const BANK_ACCOUNT = process.env.BANK_ACCOUNT || '';
const BANK_ACCOUNT_NAME = process.env.BANK_ACCOUNT_NAME || '';

// Tạo link ảnh mã QR chuyển khoản (dịch vụ VietQR, miễn phí, không cần đăng ký)
function buildQrUrl(amount, note) {
  if (!BANK_ID || !BANK_ACCOUNT) return null;
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: note,
    accountName: BANK_ACCOUNT_NAME
  });
  return `https://img.vietqr.io/image/${BANK_ID}-${BANK_ACCOUNT}-compact2.png?${params.toString()}`;
}

const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json'); // Không còn dùng để lưu trực tiếp nữa (xem productsStore.js) - giữ lại file này trong repo như 1 bản sao lưu gốc

app.use(cors());
app.use(express.json({ limit: '20mb' })); // MỚI: tăng giới hạn để nhận được dữ liệu nhập hàng loạt từ Shopee (mặc định 100KB quá nhỏ)
app.use(express.static(path.join(__dirname, 'public')));

// MỚI: link riêng cho từng sản phẩm (VD: giftlabbyu.shop/product/12345) - trả về trang chủ,
// JS phía client sẽ tự đọc URL để mở đúng trang chi tiết sản phẩm đó
app.get('/product/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- Helper: đọc / ghi file JSON ----------
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// MỚI: tính phí gói quà (giấy kraft tổ ong + ruy băng) - gói CHUNG cả đơn, không
// gói riêng từng sản phẩm, nên phí tính theo TỔNG SỐ LƯỢNG sản phẩm trong giỏ.
// Vẫn giữ nguyên kiểu tính bậc như cũ, chỉ khác là 2 mốc giá + ngưỡng miễn phí giờ
// đọc từ cấu hình (admin chỉnh trong tab Vận chuyển) thay vì gắn cứng trong code.
function calculateGiftWrapFee(totalQty, wantGiftWrap, giftWrapConfig) {
  if (!giftWrapConfig || !giftWrapConfig.active || !wantGiftWrap || totalQty <= 0) return 0;
  const freeFromQty = giftWrapConfig.freeFromQty || 3;
  if (totalQty >= freeFromQty) return 0;
  if (totalQty === 1) return giftWrapConfig.priceFor1 || 0;
  return giftWrapConfig.priceFor2 || 0; // áp dụng cho mọi mức từ 2 đến trước ngưỡng miễn phí
}

// MỚI: tính tổng tiền các dịch vụ/sản phẩm kèm thêm admin tự thêm (mỗi mục giá cố định,
// không tính theo số lượng như gói quà) - selectedAddOnIds là mảng id do khách tick chọn
function calculateAddOnsFee(addOnsConfig, selectedAddOnIds) {
  const ids = new Set((selectedAddOnIds || []).map(String));
  const applied = (addOnsConfig || []).filter(a => a.active && ids.has(String(a.id)));
  const fee = applied.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  return { fee, applied: applied.map(a => ({ id: a.id, label: a.label, price: Number(a.price) || 0 })) };
}

// Gom logic tính giỏ hàng + phí ship dùng chung cho /api/orders và /api/shipping-estimate
// MỚI: trừ hoặc cộng trả tồn kho theo danh sách item của 1 đơn hàng.
// sign = -1 khi đặt đơn thành công (trừ kho ngay, kể cả CHƯA thanh toán).
// sign = +1 khi đơn bị huỷ (cộng trả lại, tránh kho bị trừ sai vĩnh viễn).
// Không throw lỗi ra ngoài - lỗi cập nhật kho không được phép làm hỏng việc đặt/huỷ đơn.
async function adjustStock(items, sign) {
  try {
    const products = await productsStore.listProducts();
    let changed = false;
    for (const item of (items || [])) {
      const product = products.find(p => p.id === String(item.id));
      if (!product || !product.variants || !product.variants.length) continue;
      const variant = product.variants[item.variantIndex] || product.variants[0];
      if (!variant) continue;
      variant.stock = Math.max(0, (variant.stock || 0) + sign * (item.qty || 0));
      product.totalStock = product.variants.reduce((s, v) => s + (v.stock || 0), 0);
      changed = true;
    }
    if (changed) await productsStore.saveProducts(products);
  } catch (err) {
    console.error('Lỗi cập nhật tồn kho:', err.message);
  }
}

async function buildOrderPricing(items, wantGiftWrap, selectedAddOnIds) {
  const products = await productsStore.listProducts();
  const [promotions, flashSales] = await Promise.all([
    promotionsStore.listPromotions(), // MỚI
    flashSalesStore.listFlashSales()  // MỚI: Flash Sale dùng CHUNG logic tính giá với khuyến mãi -
                                       // findActivePromoItem chỉ trả về kết quả khi chương trình ĐÃ
                                       // thực sự bắt đầu, nên trước giờ chạy Flash Sale, giá tính tiền
                                       // tự động vẫn là giá gốc dù trang chủ đã hiển thị chương trình.
  ]);
  let total = 0;
  const orderItems = [];
  const insufficientStock = []; // MỚI: danh sách SKU không đủ tồn kho so với số lượng đặt
  for (const item of (items || [])) {
    const product = products.find(p => p.id === String(item.id));
    if (!product) continue;
    const variants = (product.variants && product.variants.length) ? product.variants : [{ name: null, price: product.priceMin || 0, stock: 0 }];
    const vIdx = Number.isInteger(item.variantIndex) ? item.variantIndex : 0;
    const variant = variants[vIdx] || variants[0];
    const qty = Math.max(1, Number(item.qty) || 1);
    // MỚI: chặn đặt vượt quá tồn kho hiện có của đúng SKU này
    const available = Number(variant.stock) || 0;
    if (qty > available) {
      insufficientStock.push({ name: product.name, variantName: variant.name, available, requested: qty });
      continue; // không cộng dồn tiền/thêm vào orderItems cho SKU không đủ hàng
    }
    // MỚI: nếu sản phẩm/SKU này đang trong 1 chương trình khuyến mãi HOẶC Flash Sale còn
    // hiệu lực (đã tới giờ bắt đầu), tự tính lại giá đã giảm - đây mới là giá thật sự tính
    // tiền, không phải giá gốc. Ưu tiên khuyến mãi trước, nếu không có mới xét Flash Sale.
    const promoMatch = promoUtils.findActivePromoItem(promotions, product.id)
      || promoUtils.findActivePromoItem(flashSales, product.id);
    let finalPrice = variant.price;
    let promoId = null, promoLimit = null;
    if (promoMatch) {
      const { discountType, discountValue } = promoUtils.resolveVariantDiscount(promoMatch.item, vIdx);
      finalPrice = promoUtils.calcDiscountedPrice(variant.price, discountType, discountValue);
      promoId = promoMatch.promo.id;
      promoLimit = promoUtils.resolveVariantLimit(promoMatch.item, vIdx);
    }
    total += finalPrice * qty;
    const weight = (variant.weight !== undefined && variant.weight !== null && variant.weight > 0) ? variant.weight : null;
    orderItems.push({
      id: product.id, name: product.name, category: product.category, variantName: variant.name,
      price: finalPrice, originalPrice: variant.price, qty, weight,
      variantIndex: vIdx, promoId, promoLimit // MỚI: dùng để kiểm tra giới hạn mua theo SĐT ở bước đặt hàng
    });
  }
  const shippingConfig = await loadShippingConfig(); // MỚI: đọc 1 lần, dùng chung cho ship + gói quà + add-ons
  const shippingResult = await calculateShippingFee(
    orderItems.map(i => ({ category: i.category, price: i.price, quantity: i.qty, weight: i.weight })),
    total
  );
  // MỚI: tổng số lượng sản phẩm (cộng dồn theo qty từng dòng, không phải số dòng khác nhau)
  const totalQty = orderItems.reduce((s, i) => s + i.qty, 0);
  const giftWrapFee = calculateGiftWrapFee(totalQty, wantGiftWrap, shippingConfig.giftWrap);
  const addOnsResult = calculateAddOnsFee(shippingConfig.addOns, selectedAddOnIds);
  return {
    orderItems,
    total,
    shippingFee: shippingResult.fee,
    freeshipApplied: shippingResult.freeshipApplied,
    giftWrap: Boolean(wantGiftWrap && shippingConfig.giftWrap && shippingConfig.giftWrap.active), // MỚI
    giftWrapFee, // MỚI
    addOns: addOnsResult.applied, // MỚI: danh sách dịch vụ kèm thêm đã chọn (để lưu lại đúng tên/giá lúc đặt)
    addOnsFee: addOnsResult.fee, // MỚI
    grandTotal: total + shippingResult.fee + giftWrapFee + addOnsResult.fee,
    totalWeightGram: shippingResult.totalWeightGram || 0, // MỚI: dùng để xuất Excel SPX (cột "Tổng cân nặng bưu gửi")
    insufficientStock // MỚI: danh sách SKU không đủ tồn kho (rỗng nếu đủ hàng hết)
  };
}

// MỚI: số tiền THỰC CẦN chuyển khoản của 1 đơn - nếu khách chọn "trả phí ship khi
// nhận hàng" (codShipping), số tiền cần chuyển sẽ KHÔNG gồm phí ship (phần đó SPX
// thu hộ lúc giao), chỉ gồm tiền hàng + gói quà + dịch vụ thêm (nếu có)
function computeDueAmount(order) {
  if (order.codShipping) {
    return (order.total || 0) + (order.giftWrapFee || 0) + (order.addOnsFee || 0);
  }
  return order.grandTotal || order.total || 0;
}

// ---------- Middleware kiểm tra quyền admin ----------
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Sai mật khẩu quản trị' });
  }
  next();
}

// ============================================================
// SẢN PHẨM
// ============================================================

app.get('/api/products', async (req, res) => {
  try {
    const products = await productsStore.listProducts();
    res.json(products);
  } catch (err) {
    console.error('Lỗi đọc sản phẩm:', err.message);
    res.status(500).json({ error: 'Không đọc được sản phẩm' });
  }
});

app.post('/api/products', requireAdmin, async (req, res) => {
  const { name, category, price, stock, image } = req.body;
  if (!name || !category || price == null) {
    return res.status(400).json({ error: 'Thiếu tên, danh mục hoặc giá' });
  }
  try {
    const products = await productsStore.listProducts();
    const newId = String(Date.now());
    const p = Number(price);
    const s = Number(stock) || 0;
    const newProduct = {
      id: newId,
      name,
      category,
      image: image || '',
      variants: [{ name: null, price: p, stock: s }],
      priceMin: p,
      priceMax: p,
      totalStock: s
    };
    products.push(newProduct);
    await productsStore.saveProducts(products);
    res.status(201).json(newProduct);
  } catch (err) {
    console.error('Lỗi thêm sản phẩm:', err.message);
    res.status(500).json({ error: 'Không thêm được sản phẩm' });
  }
});

app.put('/api/products/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const products = await productsStore.listProducts();
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

    const { name, category, image, description, detailImages, hidden } = req.body;
    products[idx] = {
      ...products[idx],
      ...(name !== undefined && { name }),
      ...(category !== undefined && { category }),
      ...(image !== undefined && { image }),
      ...(description !== undefined && { description }),
      ...(detailImages !== undefined && { detailImages }),
      ...(hidden !== undefined && { hidden }), // MỚI: ẩn/hiện sản phẩm trên trang khách xem
    };
    await productsStore.saveProducts(products);
    res.json(products[idx]);
  } catch (err) {
    console.error('Lỗi sửa sản phẩm:', err.message);
    res.status(500).json({ error: 'Không sửa được sản phẩm' });
  }
});

app.put('/api/products/:id/variant/:variantIndex', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const vIdx = Number(req.params.variantIndex);
  try {
    const products = await productsStore.listProducts();
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const variant = products[idx].variants[vIdx];
    if (!variant) return res.status(404).json({ error: 'Không tìm thấy phân loại' });

    const { price, stock, image, weight } = req.body;
    if (price !== undefined) variant.price = Number(price);
    if (stock !== undefined) variant.stock = Number(stock);
    if (image !== undefined) variant.image = image;
    if (weight !== undefined) variant.weight = (weight === '' || weight === null) ? null : Number(weight);

    const prices = products[idx].variants.map(v => v.price).filter(p => p > 0);
    products[idx].priceMin = prices.length ? Math.min(...prices) : 0;
    products[idx].priceMax = prices.length ? Math.max(...prices) : 0;
    products[idx].totalStock = products[idx].variants.reduce((s, v) => s + v.stock, 0);

    await productsStore.saveProducts(products);
    res.json(products[idx]);
  } catch (err) {
    console.error('Lỗi sửa phân loại:', err.message);
    res.status(500).json({ error: 'Không sửa được phân loại' });
  }
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    let products = await productsStore.listProducts();
    const exists = products.some(p => p.id === id);
    if (!exists) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    products = products.filter(p => p.id !== id);
    await productsStore.saveProducts(products);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi xoá sản phẩm:', err.message);
    res.status(500).json({ error: 'Không xoá được sản phẩm' });
  }
});

// MỚI: nhập/cập nhật hàng loạt sản phẩm từ 3 file Excel Shopee xuất ra
// (basic_info: tên + mô tả, sales_info: phân loại/giá/kho, media_info: ảnh)
// Sản phẩm đã có (trùng Mã Sản phẩm) sẽ được CẬP NHẬT lại tên/giá/kho/ảnh/mô tả,
// nhưng KHÔNG đổi danh mục đã gán trước đó. Sản phẩm mới sẽ tạm xếp vào "Phụ kiện khác".
app.post('/api/admin/products/bulk-import', requireAdmin, async (req, res) => {
  const { basic, sales, media } = req.body;
  if (!Array.isArray(sales) || sales.length === 0) {
    return res.status(400).json({ error: 'Thiếu dữ liệu giá/kho (file sales_info)' });
  }
  try {
    const products = await productsStore.listProducts();
    const byId = new Map(products.map(p => [p.id, p]));

    const variantsByProduct = new Map();
    const nameByProduct = new Map();
    for (const row of sales) {
      const id = String(row.id);
      if (!variantsByProduct.has(id)) variantsByProduct.set(id, []);
      variantsByProduct.get(id).push({
        name: row.variationName || null,
        price: Number(row.price) || 0,
        stock: Number(row.stock) || 0,
        image: ''
      });
      if (row.name) nameByProduct.set(id, row.name);
    }

    const basicById = new Map((basic || []).map(r => [String(r.id), r]));
    const mediaById = new Map((media || []).map(r => [String(r.id), r]));

    let created = 0, updated = 0;
    for (const [id, variants] of variantsByProduct) {
      const basicRow = basicById.get(id);
      const mediaRow = mediaById.get(id);
      const name = (basicRow && basicRow.name) || (mediaRow && mediaRow.name) || nameByProduct.get(id) || 'Sản phẩm chưa đặt tên';
      const description = basicRow ? basicRow.description : undefined;
      const image = mediaRow ? mediaRow.cover : undefined;
      const detailImages = mediaRow ? (mediaRow.images || []).filter(Boolean).slice(0, 9) : undefined;

      const prices = variants.map(v => v.price).filter(p => p > 0);
      const priceMin = prices.length ? Math.min(...prices) : 0;
      const priceMax = prices.length ? Math.max(...prices) : 0;
      const totalStock = variants.reduce((s, v) => s + v.stock, 0);

      if (byId.has(id)) {
        const existing = byId.get(id);
        existing.name = name;
        existing.variants = variants;
        existing.priceMin = priceMin;
        existing.priceMax = priceMax;
        existing.totalStock = totalStock;
        if (image) existing.image = image;
        if (detailImages && detailImages.length) existing.detailImages = detailImages;
        if (description !== undefined) existing.description = description;
        updated++;
      } else {
        byId.set(id, {
          id,
          name,
          category: 'khac',
          image: image || '',
          detailImages: detailImages || [],
          description: description || '',
          variants,
          priceMin, priceMax, totalStock
        });
        created++;
      }
    }

    await productsStore.saveProducts(Array.from(byId.values()));
    res.json({ success: true, created, updated });
  } catch (err) {
    console.error('Lỗi nhập sản phẩm từ Shopee:', err.message);
    res.status(500).json({ error: 'Không nhập được sản phẩm' });
  }
});

// MỚI: tự động đoán danh mục theo từ khoá trong tên sản phẩm - chỉ áp dụng cho
// sản phẩm đang ở "Phụ kiện khác" (khac), không đụng sản phẩm đã có danh mục khác
function guessCategoryFromName(name) {
  const rules = [
    { key: 'butdao', patterns: [/bút\s*dao/i, /but\s*dao/i, /rọc\s*giấy/i, /roc\s*giay/i] },
    { key: 'blindbox', patterns: [/blind\s*box/i] },
    { key: 'mockhoa', patterns: [/móc\s*kho[áa]/i, /moc\s*khoa/i, /keychain/i] },
    { key: 'khungtranh', patterns: [/khung\s*[aả]nh/i, /khung\s*anh/i, /standee/i, /toploader/i] },
    { key: 'mohinh', patterns: [/mô\s*h[ìi]nh/i, /mo\s*hinh/i, /\bbean\b/i, /figure/i] },
  ];
  for (const rule of rules) {
    if (rule.patterns.some(re => re.test(name))) return rule.key;
  }
  return null;
}

// MỚI: ẩn hàng loạt tất cả sản phẩm đang hết hàng khỏi trang khách xem
app.post('/api/admin/products/hide-out-of-stock', requireAdmin, async (req, res) => {
  try {
    const products = await productsStore.listProducts();
    let changed = 0;
    for (const p of products) {
      if (p.totalStock <= 0 && !p.hidden) { p.hidden = true; changed++; }
    }
    await productsStore.saveProducts(products);
    res.json({ success: true, changed });
  } catch (err) {
    console.error('Lỗi ẩn sản phẩm hết hàng:', err.message);
    res.status(500).json({ error: 'Không ẩn được sản phẩm hết hàng' });
  }
});

app.post('/api/admin/products/auto-categorize', requireAdmin, async (req, res) => {
  try {
    const products = await productsStore.listProducts();
    let changed = 0;
    for (const p of products) {
      if (p.category === 'khac') {
        const guess = guessCategoryFromName(p.name || '');
        if (guess) { p.category = guess; changed++; }
      }
    }
    await productsStore.saveProducts(products);
    res.json({ success: true, changed });
  } catch (err) {
    console.error('Lỗi tự động phân loại:', err.message);
    res.status(500).json({ error: 'Không tự động phân loại được' });
  }
});

// MỚI: đổi danh mục hàng loạt cho nhiều sản phẩm cùng lúc (dùng trong mục Quản lý danh mục)
app.post('/api/admin/products/bulk-set-category', requireAdmin, async (req, res) => {
  const { ids, category } = req.body;
  if (!Array.isArray(ids) || ids.length === 0 || !category) {
    return res.status(400).json({ error: 'Thiếu danh sách sản phẩm hoặc danh mục' });
  }
  try {
    const products = await productsStore.listProducts();
    const idSet = new Set(ids.map(String));
    let count = 0;
    for (const p of products) {
      if (idSet.has(p.id)) { p.category = category; count++; }
    }
    await productsStore.saveProducts(products);
    res.json({ success: true, count });
  } catch (err) {
    console.error('Lỗi đổi danh mục hàng loạt:', err.message);
    res.status(500).json({ error: 'Không đổi được danh mục' });
  }
});

app.post('/api/upload-image', requireAdmin, upload.single('image'), async (req, res) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return res.status(500).json({ error: 'Chưa cấu hình Cloudinary trong .env' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Chưa chọn file ảnh' });
  }
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'giftlab-shop' },
        (err, result) => err ? reject(err) : resolve(result)
      );
      stream.end(req.file.buffer);
    });
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error('Lỗi tải ảnh lên Cloudinary:', err.message);
    res.status(500).json({ error: 'Tải ảnh lên thất bại, thử lại giúp mình' });
  }
});

// MỚI: banner + bộ sưu tập trang chủ - khách xem (công khai) và admin sửa
// MỚI: giờ lưu qua Google Sheets (homepageStore.js) thay vì file JSON, để không mất
// dữ liệu khi Render sleep rồi khởi động lại container
app.get('/api/homepage-content', async (req, res) => {
  try {
    res.json(await homepageStore.getContent());
  } catch (err) {
    console.error('Lỗi đọc nội dung trang chủ:', err.message);
    res.status(500).json({ error: 'Không đọc được nội dung trang chủ' });
  }
});

// MỚI: các trang chính sách (điều khoản, vận chuyển, đổi trả, bảo mật, thanh toán)
// - khách xem (công khai, để hiển thị ở cuối trang chủ và trang policy.html) và admin sửa
// Lưu qua Google Sheets (policiesStore.js), cùng cách với trang chủ
app.get('/api/policies', async (req, res) => {
  try {
    res.json(await policiesStore.getContent());
  } catch (err) {
    console.error('Lỗi đọc nội dung chính sách:', err.message);
    res.status(500).json({ error: 'Không đọc được nội dung chính sách' });
  }
});

// MỚI: danh mục sản phẩm - khách xem (công khai) và admin thêm/sửa/xoá
// MỚI: giờ lưu qua Google Sheets (categoriesStore.js) thay vì file JSON, để không mất
// dữ liệu khi Render sleep rồi khởi động lại container
app.get('/api/categories', async (req, res) => {
  try {
    res.json(await categoriesStore.listCategories());
  } catch (err) {
    console.error('Lỗi đọc danh mục:', err.message);
    res.status(500).json({ error: 'Không đọc được danh mục' });
  }
});

app.post('/api/admin/categories', requireAdmin, async (req, res) => {
  const newCategories = req.body;
  if (!Array.isArray(newCategories)) {
    return res.status(400).json({ error: 'Dữ liệu danh mục không hợp lệ' });
  }
  try {
    const oldCategories = await categoriesStore.listCategories();
    const newKeys = new Set(newCategories.map(c => c.key));
    const removedKeys = oldCategories.filter(c => !newKeys.has(c.key)).map(c => c.key);

    if (removedKeys.length > 0) {
      const products = await productsStore.listProducts();
      const stillUsed = removedKeys.filter(key => products.some(p => p.category === key));
      if (stillUsed.length > 0) {
        const labels = oldCategories.filter(c => stillUsed.includes(c.key)).map(c => c.label);
        return res.status(400).json({
          error: `Không thể xoá danh mục "${labels.join(', ')}" vì vẫn còn sản phẩm thuộc danh mục này. Hãy đổi danh mục cho các sản phẩm đó trước.`
        });
      }
    }

    await categoriesStore.saveCategories(newCategories);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi lưu danh mục:', err.message);
    res.status(500).json({ error: 'Không lưu được danh mục' });
  }
});

// ============================================================
// KHUYẾN MÃI
// ============================================================

// MỚI: khách xem (công khai) - trả về các chương trình CÒN CHO HIỂN THỊ (kể cả chương
// trình CHƯA tới giờ bắt đầu - để trang chủ vẫn hiện khối này kèm đếm ngược, cho khách
// xem/thêm giỏ hàng trước giờ chạy), kèm giá đã tính giảm sẵn cho từng sản phẩm/SKU tham
// gia + cờ "isActive" (đã tới giờ bắt đầu hay chưa) để trang chủ tự quyết định hiện giá
// gốc hay giá sale. Giá THỰC SỰ TÍNH TIỀN vẫn luôn do server tính lại lúc đặt hàng (xem
// buildOrderPricing) dựa trên đúng thời điểm hiện tại, không phụ thuộc dữ liệu này.
app.get('/api/promotions', async (req, res) => {
  try {
    const [promotions, products] = await Promise.all([
      promotionsStore.listPromotions(),
      productsStore.listProducts()
    ]);
    const now = new Date();
    // Còn hiển thị: chưa bị kết thúc sớm, chưa qua giờ kết thúc, và có chọn vị trí hiển thị
    const visible = promotions.filter(p => {
      if (p.endedEarly) return false;
      if (p.displayPosition === 'none' || !p.displayPosition) return false;
      if (p.endAt && now > new Date(p.endAt)) return false;
      return true;
    });
    const result = visible.map(promo => {
      const isActive = promoUtils.isPromotionActive(promo, now);
      const items = (promo.items || []).map(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) return null;
        const variants = (product.variants && product.variants.length) ? product.variants : [{ name: null, price: product.priceMin || 0, stock: 0 }];
        const variantPrices = variants.map((v, idx) => {
          const { discountType, discountValue } = promoUtils.resolveVariantDiscount(item, idx);
          return {
            variantIndex: idx,
            originalPrice: v.price,
            discountedPrice: promoUtils.calcDiscountedPrice(v.price, discountType, discountValue),
            limitPerPhone: promoUtils.resolveVariantLimit(item, idx)
          };
        });
        return { productId: item.productId, variantPrices };
      }).filter(Boolean);
      return {
        id: promo.id, name: promo.name, description: promo.description,
        startAt: promo.startAt, endAt: promo.endAt, displayPosition: promo.displayPosition,
        isActive, // MỚI: đã tới giờ bắt đầu hay chưa - trang chủ dùng để quyết định hiện giá gốc hay giá sale
        items
      };
    });
    res.json(result);
  } catch (err) {
    console.error('Lỗi đọc khuyến mãi:', err.message);
    res.status(500).json({ error: 'Không đọc được khuyến mãi' });
  }
});

// MỚI: admin xem TOÀN BỘ chương trình (kể cả sắp diễn ra/đã kết thúc) để quản lý
app.get('/api/admin/promotions', requireAdmin, async (req, res) => {
  try {
    res.json(await promotionsStore.listPromotions());
  } catch (err) {
    console.error('Lỗi đọc khuyến mãi:', err.message);
    res.status(500).json({ error: 'Không đọc được khuyến mãi' });
  }
});

// MỚI: admin lưu lại TOÀN BỘ danh sách chương trình khuyến mãi (thêm/sửa/xoá/kết thúc sớm)
app.post('/api/admin/promotions', requireAdmin, async (req, res) => {
  const promotions = req.body;
  if (!Array.isArray(promotions)) {
    return res.status(400).json({ error: 'Dữ liệu khuyến mãi không hợp lệ' });
  }
  try {
    await promotionsStore.savePromotions(promotions);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi lưu khuyến mãi:', err.message);
    res.status(500).json({ error: 'Không lưu được khuyến mãi' });
  }
});

// ============================================================
// FLASH SALE
// ============================================================
// Khác với khuyến mãi: khách xem (công khai) nhận được TẤT CẢ chương trình Flash
// Sale còn đang cho hiển thị (chưa kết thúc/chưa bị kết thúc sớm và có chọn vị trí
// hiển thị), KỂ CẢ những chương trình CHƯA tới giờ bắt đầu - để trang chủ vẫn hiện
// khối Flash Sale kèm đếm ngược, cho khách xem + thêm giỏ hàng trước giờ diễn ra.
// Mỗi sản phẩm luôn trả về CẢ giá gốc lẫn giá sale + cờ "isActive" của chương trình,
// để phía trang chủ tự quyết định hiển thị giá nào (giá gốc nếu chưa tới giờ, giá sale
// nếu đã bắt đầu) - còn giá THỰC SỰ TÍNH TIỀN vẫn luôn do server tính lại lúc đặt hàng
// (xem buildOrderPricing), không phụ thuộc vào giá trình duyệt gửi lên.
app.get('/api/flash-sales', async (req, res) => {
  try {
    const [flashSales, products] = await Promise.all([
      flashSalesStore.listFlashSales(),
      productsStore.listProducts()
    ]);
    const now = new Date();
    // Còn hiển thị: chưa bị kết thúc sớm, chưa qua giờ kết thúc, và có chọn vị trí hiển thị
    const visible = flashSales.filter(f => {
      if (f.endedEarly) return false;
      if (f.displayPosition === 'none' || !f.displayPosition) return false;
      if (f.endAt && now > new Date(f.endAt)) return false;
      return true;
    });
    const result = visible.map(sale => {
      const isActive = promoUtils.isPromotionActive(sale, now);
      const items = (sale.items || []).map(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) return null;
        const variants = (product.variants && product.variants.length) ? product.variants : [{ name: null, price: product.priceMin || 0, stock: 0 }];
        const variantPrices = variants.map((v, idx) => {
          const { discountType, discountValue } = promoUtils.resolveVariantDiscount(item, idx);
          return {
            variantIndex: idx,
            originalPrice: v.price,
            discountedPrice: promoUtils.calcDiscountedPrice(v.price, discountType, discountValue),
            limitPerPhone: promoUtils.resolveVariantLimit(item, idx)
          };
        });
        return { productId: item.productId, variantPrices };
      }).filter(Boolean);
      return {
        id: sale.id, name: sale.name, description: sale.description,
        startAt: sale.startAt, endAt: sale.endAt, displayPosition: sale.displayPosition,
        isActive, // MỚI: đã tới giờ bắt đầu hay chưa - trang chủ dùng để quyết định hiện giá gốc hay giá sale
        items
      };
    });
    res.json(result);
  } catch (err) {
    console.error('Lỗi đọc flash sale:', err.message);
    res.status(500).json({ error: 'Không đọc được flash sale' });
  }
});

// MỚI: admin xem TOÀN BỘ chương trình Flash Sale (kể cả sắp diễn ra/đã kết thúc) để quản lý
app.get('/api/admin/flash-sales', requireAdmin, async (req, res) => {
  try {
    res.json(await flashSalesStore.listFlashSales());
  } catch (err) {
    console.error('Lỗi đọc flash sale:', err.message);
    res.status(500).json({ error: 'Không đọc được flash sale' });
  }
});

// MỚI: admin lưu lại TOÀN BỘ danh sách chương trình Flash Sale (thêm/sửa/xoá/kết thúc sớm)
app.post('/api/admin/flash-sales', requireAdmin, async (req, res) => {
  const flashSales = req.body;
  if (!Array.isArray(flashSales)) {
    return res.status(400).json({ error: 'Dữ liệu flash sale không hợp lệ' });
  }
  try {
    await flashSalesStore.saveFlashSales(flashSales);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi lưu flash sale:', err.message);
    res.status(500).json({ error: 'Không lưu được flash sale' });
  }
});

// MỚI: giờ lưu qua Google Sheets (homepageStore.js) thay vì file JSON
app.get('/api/admin/homepage-content', requireAdmin, async (req, res) => {
  try {
    res.json(await homepageStore.getContent());
  } catch (err) {
    console.error('Lỗi đọc nội dung trang chủ:', err.message);
    res.status(500).json({ error: 'Không đọc được nội dung trang chủ' });
  }
});

app.post('/api/admin/homepage-content', requireAdmin, async (req, res) => {
  try {
    await homepageStore.saveContent(req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi lưu nội dung trang chủ:', err.message);
    res.status(500).json({ error: 'Không lưu được nội dung trang chủ' });
  }
});

// MỚI: admin xem/sửa nội dung các trang chính sách - lưu qua Google Sheets (policiesStore.js)
app.get('/api/admin/policies', requireAdmin, async (req, res) => {
  try {
    res.json(await policiesStore.getContent());
  } catch (err) {
    console.error('Lỗi đọc nội dung chính sách:', err.message);
    res.status(500).json({ error: 'Không đọc được nội dung chính sách' });
  }
});

app.post('/api/admin/policies', requireAdmin, async (req, res) => {
  try {
    await policiesStore.saveContent(req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi lưu nội dung chính sách:', err.message);
    res.status(500).json({ error: 'Không lưu được nội dung chính sách' });
  }
});

// MỚI: Admin xem / sửa toàn bộ cấu hình ship (cân nặng mặc định, mốc phí, freeship)
app.get('/api/admin/shipping-config', requireAdmin, async (req, res) => {
  try {
    res.json(await loadShippingConfig());
  } catch (err) {
    console.error('Lỗi đọc cấu hình ship:', err.message);
    res.status(500).json({ error: 'Không đọc được cấu hình vận chuyển' });
  }
});

app.post('/api/admin/shipping-config', requireAdmin, async (req, res) => {
  try {
    await saveShippingConfig(req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi lưu cấu hình ship:', err.message);
    res.status(500).json({ error: 'Không lưu được cấu hình vận chuyển' });
  }
});

// MỚI: cho khách xem quy tắc ship công khai (không cần đăng nhập) — dùng để tự
// xác định sản phẩm nào đủ điều kiện freeship và gắn icon trên trang chủ
app.get('/api/shipping-config', async (req, res) => {
  try {
    res.json(await loadShippingConfig());
  } catch (err) {
    console.error('Lỗi đọc cấu hình ship:', err.message);
    res.status(500).json({ error: 'Không đọc được cấu hình vận chuyển' });
  }
});

app.post('/api/shipping-estimate', async (req, res) => {
  try {
    const { items, wantGiftWrap, selectedAddOnIds } = req.body; // MỚI: selectedAddOnIds
    if (!Array.isArray(items) || items.length === 0) {
      return res.json({ total: 0, shippingFee: 0, freeshipApplied: null, giftWrapFee: 0, addOnsFee: 0, grandTotal: 0 });
    }
    const pricing = await buildOrderPricing(items, wantGiftWrap, selectedAddOnIds);
    res.json({
      total: pricing.total,
      shippingFee: pricing.shippingFee,
      freeshipApplied: pricing.freeshipApplied,
      giftWrapFee: pricing.giftWrapFee, // MỚI
      addOnsFee: pricing.addOnsFee, // MỚI
      grandTotal: pricing.grandTotal
    });
  } catch (err) {
    console.error('Lỗi tính phí ship:', err.message);
    res.status(500).json({ error: 'Không tính được phí ship' });
  }
});

// ============================================================
// ĐƠN HÀNG
// ============================================================

app.post('/api/orders', async (req, res) => {
  const { customerName, phone, email, province, ward, addressDetail, note, items, wantGiftWrap, selectedAddOnIds, codShipping } = req.body; // MỚI: email, selectedAddOnIds, codShipping

  // MỚI: bắt buộc chọn Tỉnh/Thành + Xã/Phường + nhập địa chỉ chi tiết (thay cho 1 ô địa chỉ gộp trước đây)
  if (!customerName || !phone || !province || !ward || !addressDetail) {
    return res.status(400).json({ error: 'Thiếu tên, số điện thoại, tỉnh/thành, xã/phường hoặc địa chỉ chi tiết' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Giỏ hàng trống' });
  }

  const pricing = await buildOrderPricing(items, wantGiftWrap, selectedAddOnIds);
  if (pricing.orderItems.length === 0) {
    return res.status(400).json({ error: 'Không có sản phẩm hợp lệ trong giỏ hàng' });
  }

  // MỚI: chặn đặt hàng nếu có SKU không đủ tồn kho - báo rõ tên sản phẩm/phân loại và
  // số lượng còn lại để khách tự điều chỉnh giỏ hàng
  if (pricing.insufficientStock.length > 0) {
    const detail = pricing.insufficientStock
      .map(i => `${i.name}${i.variantName ? ' - ' + i.variantName : ''} (còn ${i.available}, bạn đặt ${i.requested})`)
      .join('; ');
    return res.status(400).json({ error: `Không đủ hàng trong kho: ${detail}. Vui lòng giảm số lượng hoặc bỏ sản phẩm này khỏi giỏ hàng.` });
  }

  // MỚI: chặn không cho đặt vượt giới hạn số lượng/1 SĐT của các sản phẩm đang khuyến mãi
  const limitedItems = pricing.orderItems.filter(i => i.promoId && i.promoLimit != null);
  if (limitedItems.length > 0) {
    const pastOrders = await ordersStore.listOrders();
    const normalizedPhone = String(phone).replace(/\s|-/g, '');
    for (const li of limitedItems) {
      const alreadyBought = pastOrders
        .filter(o => o.status !== 'huy' && String(o.phone).replace(/\s|-/g, '') === normalizedPhone)
        .reduce((sum, o) => sum + (o.items || [])
          .filter(it => it.id === li.id && it.promoId === li.promoId && (it.variantIndex === li.variantIndex))
          .reduce((s, it) => s + (it.qty || 0), 0), 0);
      if (alreadyBought + li.qty > li.promoLimit) {
        const remaining = Math.max(0, li.promoLimit - alreadyBought);
        return res.status(400).json({
          error: `"${li.name}"${li.variantName ? ' - ' + li.variantName : ''} đang giới hạn tối đa ${li.promoLimit} sản phẩm/số điện thoại trong chương trình khuyến mãi. Số điện thoại này chỉ còn được mua thêm ${remaining} sản phẩm.`
        });
      }
    }
  }

  // MỚI: vẫn giữ 1 chuỗi địa chỉ gộp để hiển thị gọn trong trang quản trị / tra cứu đơn
  const address = `${addressDetail}, ${ward}, ${province}`;

  try {
    const newOrder = {
      id: await ordersStore.nextOrderId(),
      customerName,
      phone,
      email: email ? String(email).trim() : '', // MỚI: không bắt buộc, dùng để tự động gửi mã vận đơn
      address,
      province,          // MỚI
      ward,               // MỚI
      addressDetail,      // MỚI
      note: note || '',
      items: pricing.orderItems,
      total: pricing.total,
      shippingFee: pricing.shippingFee,
      freeshipApplied: pricing.freeshipApplied,
      giftWrap: pricing.giftWrap,       // MỚI
      giftWrapFee: pricing.giftWrapFee, // MỚI
      addOns: pricing.addOns,           // MỚI
      addOnsFee: pricing.addOnsFee,     // MỚI
      grandTotal: pricing.grandTotal,
      totalWeightGram: pricing.totalWeightGram, // MỚI
      status: 'moi',
      paid: false,
      codShipping: Boolean(codShipping && pricing.shippingFee > 0), // MỚI: chỉ có ý nghĩa khi thực sự có phí ship
      trackingCode: '',
      createdAt: new Date().toISOString()
    };
    await ordersStore.appendOrder(newOrder);
    await adjustStock(pricing.orderItems, -1); // MỚI: trừ kho ngay khi đặt đơn, kể cả chưa thanh toán
    emailNotify.sendNewOrderEmail(newOrder); // MỚI: báo email cho chủ shop - không dùng await để khách không phải chờ email gửi xong mới nhận được phản hồi đặt hàng thành công

    // MỚI: nếu chọn trả ship khi nhận hàng, số tiền QR KHÔNG gồm phí ship
    const dueAmount = computeDueAmount(newOrder);
    const qrUrl = buildQrUrl(dueAmount, `DH${newOrder.id} ${customerName}`);
    res.status(201).json({ ...newOrder, qrUrl, dueAmount });
  } catch (err) {
    console.error('Lỗi lưu đơn hàng:', err.message);
    res.status(500).json({ error: 'Không lưu được đơn hàng, thử lại giúp mình' });
  }
});

app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await ordersStore.listOrders();
    res.json(orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (err) {
    console.error('Lỗi đọc đơn hàng:', err.message);
    res.status(500).json({ error: 'Không đọc được danh sách đơn hàng' });
  }
});

// MỚI: khách tìm các đơn hàng của mình chỉ bằng số điện thoại (không cần nhớ mã đơn)
// Trả về danh sách rút gọn để khách chọn đúng đơn cần xem
app.post('/api/orders/find-by-phone', async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Nhập số điện thoại' });
  }
  try {
    const orders = await ordersStore.listOrders();
    const normalizedPhone = String(phone).replace(/\s|-/g, '');
    const matches = orders
      .filter(o => String(o.phone).replace(/\s|-/g, '') === normalizedPhone)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10)
      .map(o => ({
        id: o.id,
        createdAt: o.createdAt,
        status: o.status,
        paid: o.paid,
        grandTotal: o.grandTotal || o.total,
        address: o.address,               // MỚI: để so khớp cùng địa chỉ khi gộp đơn
        trackingCode: o.trackingCode || '', // MỚI: đã có mã vận đơn thì không gộp được nữa
        mergeGroupId: o.mergeGroupId || null // MỚI: đã ở trong 1 nhóm gộp khác
      }));
    if (matches.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng nào với số điện thoại này' });
    }
    res.json(matches);
  } catch (err) {
    console.error('Lỗi tìm đơn theo SĐT:', err.message);
    res.status(500).json({ error: 'Không tìm được đơn hàng' });
  }
});

// Khách tự tra cứu 1 đơn hàng cụ thể bằng mã đơn + số điện thoại
// MỚI: kèm theo mã QR nếu đơn đó CHƯA thanh toán, để khách chuyển khoản lại nếu cần
app.post('/api/orders/lookup', async (req, res) => {
  const { orderId, phone } = req.body;
  if (!orderId || !phone) {
    return res.status(400).json({ error: 'Nhập mã đơn hàng và số điện thoại' });
  }
  try {
    const orders = await ordersStore.listOrders();
    const normalizedPhone = String(phone).replace(/\s|-/g, '');
    const order = orders.find(o =>
      o.id === Number(orderId) &&
      String(o.phone).replace(/\s|-/g, '') === normalizedPhone
    );
    if (!order) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng — kiểm tra lại mã đơn và số điện thoại' });
    }
    // MỚI: nếu chưa thanh toán, kèm lại mã QR đúng số tiền để khách chuyển khoản
    // (nếu đơn chọn trả ship khi nhận hàng, số tiền KHÔNG gồm phí ship)
    const dueAmount = computeDueAmount(order);
    const qrUrl = !order.paid
      ? buildQrUrl(dueAmount, `DH${order.id} ${order.customerName}`)
      : null;
    res.json({ ...order, qrUrl, dueAmount });
  } catch (err) {
    console.error('Lỗi tra cứu đơn hàng:', err.message);
    res.status(500).json({ error: 'Không tra cứu được đơn hàng' });
  }
});

// ============================================================
// GỘP ĐƠN - khách tự chọn 2+ đơn CÙNG địa chỉ, đặt trong vòng 24h, chưa
// thanh toán ship riêng, chưa có mã vận đơn, để gửi chung 1 lần và chỉ trả
// 1 khoản phí ship tính lại theo tổng cân nặng (thay vì trả phí ship từng đơn).
// ============================================================

// Kiểm tra 1 danh sách đơn có đủ điều kiện gộp không - dùng chung cho quote + confirm
function validateMergeCandidates(selected, orderIds, phone) {
  const normalizedPhone = String(phone).replace(/\s|-/g, '');
  if (selected.length !== orderIds.length) {
    return 'Không tìm thấy đủ các đơn đã chọn';
  }
  for (const o of selected) {
    if (String(o.phone).replace(/\s|-/g, '') !== normalizedPhone) {
      return 'Có đơn không thuộc số điện thoại này';
    }
    if (o.trackingCode) {
      return `Đơn DH${o.id} đã có mã vận đơn, không thể gộp nữa`;
    }
    if (o.status === 'huy') {
      return `Đơn DH${o.id} đã huỷ, không thể gộp`;
    }
    if (o.mergeGroupId) {
      return `Đơn DH${o.id} đã ở trong 1 nhóm gộp khác`;
    }
  }
  const firstAddress = selected[0].address;
  if (!selected.every(o => o.address === firstAddress)) {
    return 'Các đơn phải cùng địa chỉ nhận hàng mới gộp được';
  }
  const earliestCreatedAt = selected.reduce(
    (min, o) => (new Date(o.createdAt) < new Date(min) ? o.createdAt : min),
    selected[0].createdAt
  );
  const hoursSince = (Date.now() - new Date(earliestCreatedAt).getTime()) / 3600000;
  if (hoursSince > 24) {
    return 'Đã quá 24h kể từ đơn đầu tiên, không thể gộp nữa';
  }
  return null;
}

// Tính lại phí ship theo tổng cân nặng của các đơn được chọn
async function computeMergedShipping(selected) {
  const combinedItems = selected.flatMap(o =>
    o.items.map(it => ({ category: it.category, price: it.price, quantity: it.qty, weight: it.weight }))
  );
  const combinedTotal = selected.reduce((s, o) => s + o.total, 0);
  return calculateShippingFee(combinedItems, combinedTotal);
}

// Khách xem thử số tiền sẽ tiết kiệm được TRƯỚC khi quyết định gộp thật
app.post('/api/orders/merge-quote', async (req, res) => {
  const { orderIds, phone, codShipping } = req.body; // MỚI: codShipping
  if (!Array.isArray(orderIds) || orderIds.length < 2 || !phone) {
    return res.status(400).json({ error: 'Cần chọn ít nhất 2 đơn và nhập số điện thoại' });
  }
  try {
    const allOrders = await ordersStore.listOrders();
    const selected = orderIds.map(id => allOrders.find(o => o.id === Number(id))).filter(Boolean);
    const err = validateMergeCandidates(selected, orderIds, phone);
    if (err) return res.status(400).json({ error: err });

    const shippingResult = await computeMergedShipping(selected);
    const oldShippingFeeSum = selected.reduce((s, o) => s + (o.shippingFee || 0), 0);
    // MỚI: nếu chọn trả ship khi nhận hàng thì không cần QR cho phần ship gộp
    const qrUrl = codShipping ? null : buildQrUrl(shippingResult.fee, `phi ship gop don ${orderIds.join('')} ${phone}`);

    res.json({
      orderIds: selected.map(o => o.id),
      combinedWeightGram: shippingResult.totalWeightGram,
      newShippingFee: shippingResult.fee,
      oldShippingFeeSum,
      saved: oldShippingFeeSum - shippingResult.fee,
      codShipping: Boolean(codShipping),
      qrUrl,
    });
  } catch (err) {
    console.error('Lỗi tính gộp đơn:', err.message);
    res.status(500).json({ error: 'Không tính được phí gộp đơn' });
  }
});

// Khách bấm xác nhận gộp thật - lưu nhóm gộp vào các đơn, phí ship riêng từng
// đơn về 0, phí ship gộp lưu chung để thanh toán qua 1 mã QR riêng (hoặc thu khi
// giao hàng nếu chọn codShipping)
app.post('/api/orders/merge-confirm', async (req, res) => {
  const { orderIds, phone, codShipping } = req.body; // MỚI: codShipping
  if (!Array.isArray(orderIds) || orderIds.length < 2 || !phone) {
    return res.status(400).json({ error: 'Cần chọn ít nhất 2 đơn và nhập số điện thoại' });
  }
  try {
    const allOrders = await ordersStore.listOrders();
    const selected = orderIds.map(id => allOrders.find(o => o.id === Number(id))).filter(Boolean);
    const err = validateMergeCandidates(selected, orderIds, phone);
    if (err) return res.status(400).json({ error: err });

    const shippingResult = await computeMergedShipping(selected);
    const groupId = Math.min(...selected.map(o => o.id));
    const mergeOrderIds = selected.map(o => o.id);
    const isCod = Boolean(codShipping);

    for (const o of selected) {
      await ordersStore.updateOrder(o.id, {
        shippingFee: 0,
        mergeGroupId: groupId,
        mergeOrderIds,
        mergeShippingFee: shippingResult.fee,
        mergeShippingPaid: false,
        mergeShippingCod: isCod,
      });
    }
    const qrUrl = isCod ? null : buildQrUrl(shippingResult.fee, `phi ship gop don ${orderIds.join('')} ${phone}`);
    res.json({
      groupId,
      orderIds: mergeOrderIds,
      combinedWeightGram: shippingResult.totalWeightGram,
      mergeShippingFee: shippingResult.fee,
      codShipping: isCod,
      qrUrl,
    });
  } catch (err) {
    console.error('Lỗi xác nhận gộp đơn:', err.message);
    res.status(500).json({ error: 'Không gộp được đơn, thử lại giúp mình' });
  }
});

app.patch('/api/orders/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status, paid, trackingCode, province, ward, addressDetail, mergeShippingPaid } = req.body; // MỚI: province/ward/addressDetail, mergeShippingPaid
  // MỚI: 'da_giao' = Đã giao, đang chờ 2 ngày để tự động chuyển "Hoàn thành"
  const validStatus = ['moi', 'cho_giao', 'dang_giao', 'da_giao', 'hoan_thanh', 'huy'];
  if (status !== undefined && !validStatus.includes(status)) {
    return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
  }
  try {
    const current = await ordersStore.getOrderById(id);
    if (!current) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    // MỚI: chặn huỷ đơn / đổi địa chỉ nếu đơn đã có mã vận đơn (đã bàn giao cho SPX)
    const wantsCancel = status === 'huy';
    const wantsAddressChange = province !== undefined || ward !== undefined || addressDetail !== undefined;
    if ((wantsCancel || wantsAddressChange) && current.trackingCode) {
      return res.status(400).json({ error: 'Đơn đã có mã vận đơn, không thể huỷ hoặc đổi địa chỉ nữa.' });
    }

    const patch = {};
    if (status !== undefined) patch.status = status;
    if (paid !== undefined) patch.paid = Boolean(paid);
    if (trackingCode !== undefined) patch.trackingCode = trackingCode;
    if (province !== undefined) patch.province = province;   // MỚI
    if (ward !== undefined) patch.ward = ward;                 // MỚI
    if (addressDetail !== undefined) patch.addressDetail = addressDetail; // MỚI
    // MỚI: nếu đổi bất kỳ phần nào của địa chỉ, ghép lại chuỗi địa chỉ gộp hiển thị gọn
    if (wantsAddressChange) {
      const p = province !== undefined ? province : current.province;
      const w = ward !== undefined ? ward : current.ward;
      const ad = addressDetail !== undefined ? addressDetail : current.addressDetail;
      patch.address = `${ad}, ${w}, ${p}`;
    }
    // MỚI: chuyển sang "Đã giao" thì tự ghi lại thời điểm, để job tự động chạy sau 2 ngày
    if (status === 'da_giao') {
      patch.deliveredAt = new Date().toISOString();
    }

    const updated = await ordersStore.updateOrder(id, patch);
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    // MỚI: đơn VỪA chuyển sang huỷ (trước đó chưa huỷ) - cộng trả lại tồn kho
    if (wantsCancel && current.status !== 'huy') {
      await adjustStock(current.items, +1);
    }
    // MỚI: nếu đơn VỪA được gắn mã vận đơn (trước đó chưa có) thì báo email cho khách
    if (trackingCode && !current.trackingCode) {
      emailNotify.sendTrackingCodeEmail(updated);
    }

    // MỚI: phí ship gộp là 1 khoản CHUNG cho cả nhóm - tick "đã thu" ở đơn nào cũng
    // cần cập nhật đồng bộ cho mọi đơn khác trong cùng nhóm gộp
    if (mergeShippingPaid !== undefined && updated.mergeGroupId) {
      const allOrders = await ordersStore.listOrders();
      const groupOrders = allOrders.filter(o => o.mergeGroupId === updated.mergeGroupId && o.id !== id);
      for (const go of groupOrders) {
        await ordersStore.updateOrder(go.id, { mergeShippingPaid: Boolean(mergeShippingPaid) });
      }
      updated.mergeShippingPaid = Boolean(mergeShippingPaid);
      await ordersStore.updateOrder(id, { mergeShippingPaid: Boolean(mergeShippingPaid) });
    }

    res.json(updated);
  } catch (err) {
    console.error('Lỗi cập nhật đơn hàng:', err.message);
    res.status(500).json({ error: 'Không cập nhật được đơn hàng' });
  }
});

// MỚI: khách tự huỷ đơn của mình - chỉ khi đơn CHƯA có mã vận đơn
app.post('/api/orders/cancel', async (req, res) => {
  const { orderId, phone } = req.body;
  if (!orderId || !phone) {
    return res.status(400).json({ error: 'Thiếu mã đơn hàng hoặc số điện thoại' });
  }
  try {
    const order = await ordersStore.getOrderById(orderId);
    const normalizedPhone = String(phone).replace(/\s|-/g, '');
    if (!order || String(order.phone).replace(/\s|-/g, '') !== normalizedPhone) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng — kiểm tra lại mã đơn và số điện thoại' });
    }
    if (order.trackingCode) {
      return res.status(400).json({ error: 'Đơn đã có mã vận đơn (đang được xử lý giao hàng), không thể tự huỷ. Liên hệ shop để được hỗ trợ.' });
    }
    if (order.status === 'huy' || order.status === 'hoan_thanh') {
      return res.status(400).json({ error: 'Đơn này không còn ở trạng thái có thể huỷ.' });
    }
    const updated = await ordersStore.updateOrder(Number(orderId), { status: 'huy' });
    await adjustStock(order.items, +1); // MỚI: cộng trả lại tồn kho khi khách tự huỷ đơn
    res.json(updated);
  } catch (err) {
    console.error('Lỗi khách tự huỷ đơn:', err.message);
    res.status(500).json({ error: 'Không huỷ được đơn hàng, thử lại giúp mình' });
  }
});

// MỚI: khách tự đổi địa chỉ nhận hàng - chỉ khi đơn CHƯA có mã vận đơn
app.post('/api/orders/update-address', async (req, res) => {
  const { orderId, phone, province, ward, addressDetail } = req.body;
  if (!orderId || !phone || !province || !ward || !addressDetail) {
    return res.status(400).json({ error: 'Thiếu thông tin — cần đủ mã đơn, số điện thoại, Tỉnh/Thành, Xã/Phường và địa chỉ chi tiết' });
  }
  try {
    const order = await ordersStore.getOrderById(orderId);
    const normalizedPhone = String(phone).replace(/\s|-/g, '');
    if (!order || String(order.phone).replace(/\s|-/g, '') !== normalizedPhone) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng — kiểm tra lại mã đơn và số điện thoại' });
    }
    if (order.trackingCode) {
      return res.status(400).json({ error: 'Đơn đã có mã vận đơn (đang được xử lý giao hàng), không thể đổi địa chỉ. Liên hệ shop để được hỗ trợ.' });
    }
    if (order.status === 'huy' || order.status === 'hoan_thanh') {
      return res.status(400).json({ error: 'Đơn này không còn ở trạng thái có thể đổi địa chỉ.' });
    }
    const address = `${addressDetail}, ${ward}, ${province}`;
    const updated = await ordersStore.updateOrder(Number(orderId), { province, ward, addressDetail, address });
    res.json(updated);
  } catch (err) {
    console.error('Lỗi khách tự đổi địa chỉ:', err.message);
    res.status(500).json({ error: 'Không đổi được địa chỉ, thử lại giúp mình' });
  }
});

// MỚI: cập nhật hàng loạt nhiều đơn cùng lúc - dùng khi tải file Excel gắn mã vận đơn
// Body: { updates: [{ id, trackingCode, status }, ...] }
app.patch('/api/orders/bulk', requireAdmin, async (req, res) => {
  const { updates } = req.body;
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'Không có đơn nào để cập nhật' });
  }
  const results = { success: [], notFound: [] };
  for (const u of updates) {
    const id = Number(u.id);
    const patch = {};
    if (u.trackingCode !== undefined) patch.trackingCode = u.trackingCode;
    if (u.status !== undefined) patch.status = u.status;
    try {
      const current = await ordersStore.getOrderById(id); // MỚI: để biết mã vận đơn có phải VỪA được gắn hay không
      const updated = await ordersStore.updateOrder(id, patch);
      if (updated) {
        results.success.push(id);
        // MỚI: nếu đơn VỪA được gắn mã vận đơn (trước đó chưa có) thì báo email cho khách
        if (u.trackingCode && current && !current.trackingCode) {
          emailNotify.sendTrackingCodeEmail(updated);
        }
      } else {
        results.notFound.push(id);
      }
    } catch (err) {
      console.error(`Lỗi cập nhật đơn #${id}:`, err.message);
      results.notFound.push(id);
    }
  }
  res.json(results);
});

// MỚI: xoá thủ công 1 đơn hàng rác/trùng/spam
app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const deleted = await ordersStore.deleteOrder(id);
    if (!deleted) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    res.json({ success: true });
  } catch (err) {
    console.error('Lỗi xoá đơn hàng:', err.message);
    res.status(500).json({ error: 'Không xoá được đơn hàng' });
  }
});

// ============================================================
// MỚI: tự động chuyển đơn từ "Đã giao" (da_giao) sang "Hoàn thành" (hoan_thanh)
// sau 2 ngày kể từ lúc admin đánh dấu đã giao (deliveredAt) - chạy định kỳ mỗi giờ
// ngay khi server đang hoạt động (không cần đợi ai vào web mới chạy)
const DELIVERED_AUTO_COMPLETE_MS = 2 * 24 * 60 * 60 * 1000; // 2 ngày
async function autoCompleteDeliveredOrders() {
  try {
    const orders = await ordersStore.listOrders();
    const now = Date.now();
    const dueOrders = orders.filter(o =>
      o.status === 'da_giao' &&
      o.deliveredAt &&
      (now - new Date(o.deliveredAt).getTime()) >= DELIVERED_AUTO_COMPLETE_MS
    );
    for (const o of dueOrders) {
      await ordersStore.updateOrder(o.id, { status: 'hoan_thanh' });
      console.log(`>>> Tự động chuyển đơn #${o.id} sang "Hoàn thành" (đã giao quá 2 ngày)`);
    }
  } catch (err) {
    console.error('Lỗi khi tự động hoàn thành đơn hàng:', err.message);
  }
}
// Chạy ngay lúc khởi động (phòng khi server vừa "thức dậy" sau thời gian ngủ), rồi lặp lại mỗi giờ
autoCompleteDeliveredOrders();
setInterval(autoCompleteDeliveredOrders, 60 * 60 * 1000);

// ============================================================
app.listen(PORT, () => {
  console.log(`GiftLab server đang chạy tại http://localhost:${PORT}`);
  console.log(`Trang khách: http://localhost:${PORT}/`);
  console.log(`Trang quản trị: http://localhost:${PORT}/admin.html`);
  console.log(ordersStore.useSheets
    ? '>>> Đang lưu đơn hàng vào Google Sheets'
    : '>>> Đang lưu đơn hàng vào file data/orders.json (CHƯA dùng Google Sheets - kiểm tra lại 3 dòng GOOGLE_... trong .env)');
  console.log(homepageStore.useSheets
    ? '>>> Đang lưu nội dung trang chủ vào Google Sheets'
    : '>>> Đang lưu nội dung trang chủ vào file homepage-content.json (CHƯA dùng Google Sheets)');
  console.log(categoriesStore.useSheets
    ? '>>> Đang lưu danh mục vào Google Sheets'
    : '>>> Đang lưu danh mục vào file categories.json (CHƯA dùng Google Sheets)');
  console.log(require('./shippingConfigStore').useSheets
    ? '>>> Đang lưu cấu hình vận chuyển vào Google Sheets'
    : '>>> Đang lưu cấu hình vận chuyển vào file shipping-config.json (CHƯA dùng Google Sheets)');
  console.log(promotionsStore.useSheets
    ? '>>> Đang lưu khuyến mãi vào Google Sheets'
    : '>>> Đang lưu khuyến mãi vào file promotions.json (CHƯA dùng Google Sheets)');
  console.log(flashSalesStore.useSheets
    ? '>>> Đang lưu Flash Sale vào Google Sheets (tab FlashSales)'
    : '>>> Đang lưu Flash Sale vào file flash-sales.json (CHƯA dùng Google Sheets)');
});

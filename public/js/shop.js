// ============================================================
// shop.js - phía khách hàng (Gift Lab)
// ============================================================

let products = [];
let shippingConfig = null;
let homepageContent = null; // MỚI: banner + bộ sưu tập trang chủ
let heroSlideIndex = 0;     // MỚI: ảnh banner đang hiện
// BẢN GOM ĐƠN: tắt hẳn banner, bộ sưu tập danh mục, sản phẩm nổi bật trên trang chủ
// — kể cả khi dữ liệu cũ (homepage-content.json) vẫn còn cấu hình sẵn từ trước.
const HOMEPAGE_LITE_MODE = true;
let vnAddress = null;       // MỚI: danh sách Tỉnh/Xã chuẩn cho form đặt hàng
let activeCat = 'all';
let categoriesList = []; // MỚI: danh sách danh mục cho sidebar desktop
let promotions = []; // MỚI: các chương trình khuyến mãi ĐANG DIỄN RA (đã tính sẵn giá giảm)
let flashSales = []; // MỚI: các chương trình Flash Sale ĐANG CHO HIỂN THỊ (kể cả chưa tới giờ bắt đầu)
let policiesContent = null; // MỚI: nội dung 5 trang chính sách, hiện ở cuối trang chủ
let siteSearchQuery = ''; // MỚI: từ khoá tìm kiếm sản phẩm
let wantGiftWrap = false;  // MỚI: khách có chọn gói quà tặng lúc checkout không
let selectedAddOnIds = new Set(); // MỚI: các dịch vụ/sản phẩm kèm thêm khách đã tick
let wantCodShipping = false; // MỚI: khách chọn trả phí ship khi nhận hàng (SPX thu hộ) thay vì chuyển khoản trước
let cart = JSON.parse(localStorage.getItem('giftlab_cart') || '{}');
let selectedCartKeys = new Set(Object.keys(cart)); // MỚI: mặc định tick chọn sẵn mọi thứ đang có trong giỏ khi tải lại trang
// drawerView: 'cart' | 'variant' | 'checkout' | 'success' | 'lookup' | 'lookup-list' | 'lookup-result'
let drawerView = 'cart';
let variantPickerProduct = null;
let lastOrder = null;
let lookupPhone = '';          // MỚI: lưu lại SĐT vừa tra cứu để bấm vào 1 đơn trong danh sách
let lookupOrderList = [];      // MỚI: danh sách đơn khi tra cứu chỉ bằng SĐT
let lookupOrderResult = null;
let lookupError = '';
let selectedMergeOrderIds = new Set(); // MỚI: đơn đang tick chọn để gộp
let mergeQuoteResult = null;           // MỚI: kết quả tính thử phí ship gộp (chưa xác nhận)
let mergeConfirmResult = null;         // MỚI: kết quả sau khi xác nhận gộp thật (kèm QR)
let wantMergeCod = false;              // MỚI: khách chọn trả phí ship GỘP khi nhận hàng thay vì chuyển khoản
// MỚI: lưu tạm thông tin form đang nhập ở bước checkout - để dù có tick/bỏ tick COD
// hay quay lại giỏ hàng rồi vào lại, thông tin đã gõ vẫn còn nguyên (không bị mất)
let checkoutForm = { customerName: '', phone: '', customerEmail: '', province: '', ward: '', addressDetail: '', note: '' };

const STATUS_LABEL = {
  moi: 'Đơn mới, đang chờ xác nhận',
  cho_giao: 'Đang chuẩn bị hàng, sắp gửi đi',
  dang_giao: 'Đang giao hàng',
  da_giao: 'Đã giao - đang chờ xác nhận', // MỚI
  hoan_thanh: 'Đã giao thành công',
  huy: 'Đơn đã hủy'
};

function fmt(n){ return n.toLocaleString('vi-VN') + 'đ'; }
function saveCart(){ localStorage.setItem('giftlab_cart', JSON.stringify(cart)); }

// MỚI: khử ký tự đặc biệt HTML trước khi chèn text do admin tự nhập (mô tả gói quà,
// tên dịch vụ kèm thêm...) vào innerHTML, tránh hỏng cấu trúc trang nếu có ký tự lạ
function escapeHtml(str){
  if(str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// MỚI: khối chọn gói quà - chỉ hiện khi admin đang bật (shippingConfig.giftWrap.active),
// mô tả + các mốc giá lấy trực tiếp từ cấu hình admin đã lưu
function renderGiftWrapCheckbox(){
  const g = shippingConfig && shippingConfig.giftWrap;
  if(!g || !g.active) return '';
  const tierText = `${fmt(g.priceFor1 || 0)} (1 sản phẩm) · ${fmt(g.priceFor2 || 0)} (2 sản phẩm) · Miễn phí từ ${g.freeFromQty || 3} sản phẩm trở lên`;
  return `
    <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; margin:12px 0; padding:10px; border:1px solid var(--line); border-radius:10px;">
      <input type="checkbox" id="cf-gift-wrap" ${wantGiftWrap ? 'checked' : ''} onchange="toggleGiftWrap(this.checked)" style="margin-top:2px;">
      <span>🎁 ${escapeHtml(g.label)} — gói chung cả đơn: ${tierText}</span>
    </label>
  `;
}

// MỚI: danh sách dịch vụ/sản phẩm kèm thêm khác (giá cố định), chỉ hiện các mục admin
// đang bật "Áp dụng"
function renderAddOnCheckboxes(){
  const list = (shippingConfig && shippingConfig.addOns) ? shippingConfig.addOns.filter(a => a.active) : [];
  if(list.length === 0) return '';
  return list.map(a => `
    <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; margin:8px 0; padding:10px; border:1px solid var(--line); border-radius:10px;">
      <input type="checkbox" ${selectedAddOnIds.has(String(a.id)) ? 'checked' : ''} onchange="toggleAddOn('${String(a.id).replace(/'/g, "\\'")}', this.checked)" style="margin-top:2px;">
      <span>${escapeHtml(a.label)} — ${fmt(a.price || 0)}</span>
    </label>
  `).join('');
}

function getVariants(p){
  return (p.variants && p.variants.length) ? p.variants : [{ name: null, price: p.priceMin || 0, stock: 0 }];
}
function priceLabel(p){
  if (p.priceMin === p.priceMax) return fmt(p.priceMin);
  return `${fmt(p.priceMin)} - ${fmt(p.priceMax)}`;
}

// MỚI: 1 chương trình (khuyến mãi HOẶC Flash Sale - cùng cấu trúc startAt/endAt/endedEarly)
// ĐANG THỰC SỰ DIỄN RA (đã tới giờ bắt đầu, chưa hết giờ, chưa bị kết thúc sớm) - tính lại
// ngay trên trình duyệt vì cả 2 danh sách tải về đều gồm CẢ chương trình CHƯA tới giờ (để
// còn hiện đếm ngược trên trang chủ)
function isProgramActiveNow(program){
  if(!program || program.endedEarly) return false;
  const now = new Date();
  const start = program.startAt ? new Date(program.startAt) : null;
  const end = program.endAt ? new Date(program.endAt) : null;
  if(start && now < start) return false;
  if(end && now > end) return false;
  return true;
}
// MỚI: tìm chương trình khuyến mãi có chứa sản phẩm này - trả về CẢ khi chương trình CHƯA
// tới giờ bắt đầu (để mọi nơi hiển thị giá đều cho khách xem trước giá sale sẽ áp dụng),
// kèm cờ "isActive" để nơi nào cần biết đã thực sự tính tiền giá sale hay chưa (VD: giỏ hàng)
function findPromoItemForProduct(productId){
  for(const promo of promotions){
    const item = (promo.items || []).find(i => i.productId === productId);
    if(item) return { promo, item, isActive: isProgramActiveNow(promo) };
  }
  return null;
}
// MỚI: tìm Flash Sale có chứa sản phẩm này - cùng logic như findPromoItemForProduct ở trên
function findFlashSaleItemForProduct(productId){
  for(const fs of flashSales){
    const item = (fs.items || []).find(i => i.productId === productId);
    if(item) return { flashSale: fs, item, isActive: isProgramActiveNow(fs) };
  }
  return null;
}
// MỚI: giá đã giảm cho đúng 1 SKU (phân loại) cụ thể - ưu tiên khuyến mãi, nếu không có mới
// xét Flash Sale - dùng cho trang chi tiết sản phẩm/chọn phân loại/giỏ hàng, LUÔN trả về giá
// sale để khách dễ hình dung (kèm "isActive" - true nếu chương trình ĐÃ bắt đầu, tức đây mới
// là giá THỰC SỰ TÍNH TIỀN; false nghĩa là mới xem trước, giá tính tiền thật vẫn là giá gốc
// cho tới đúng giờ - xem thêm ghi chú ở khu giỏ hàng)
function getVariantPromoPrice(productId, variantIndex){
  const match = findPromoItemForProduct(productId) || findFlashSaleItemForProduct(productId);
  if(!match) return null;
  const vp = (match.item.variantPrices || []).find(v => v.variantIndex === variantIndex);
  return vp ? { ...vp, isActive: match.isActive } : null; // { variantIndex, originalPrice, discountedPrice, limitPerPhone, isActive }
}
// MỚI: khoảng giá hiển thị trên thẻ sản phẩm - LUÔN dùng giá đã giảm nếu sản phẩm đang tham
// gia khuyến mãi/Flash Sale, kể cả khi chương trình CHƯA tới giờ bắt đầu (để khách dễ hình
// dung mức giá sắp có) - kèm "isActive" để thẻ sản phẩm có thể phân biệt "SALE" (đang chạy)
// hay "SẮP SALE" (chưa tới giờ)
function getEffectivePriceRange(p){
  const match = findPromoItemForProduct(p.id) || findFlashSaleItemForProduct(p.id);
  if(!match || !match.item.variantPrices || match.item.variantPrices.length === 0){
    return { min: p.priceMin, max: p.priceMax, onSale: false };
  }
  const prices = match.item.variantPrices.map(v => v.discountedPrice);
  return {
    min: Math.min(...prices), max: Math.max(...prices), onSale: true, isActive: match.isActive,
    originalMin: p.priceMin, originalMax: p.priceMax
  };
}

// ---------- Tải sản phẩm từ server ----------
async function loadProducts(){
  const [productsRes, shippingRes, homepageRes, addressRes, categoriesRes, promotionsRes, flashSalesRes, policiesRes] = await Promise.all([
    fetch('/api/products'),
    fetch('/api/shipping-config').catch(() => null),
    fetch('/api/homepage-content').catch(() => null),
    fetch('/vn-address.json').catch(() => null), // MỚI: danh sách Tỉnh/Xã cho form đặt hàng
    fetch('/api/categories').catch(() => null), // MỚI: danh sách danh mục cho sidebar desktop
    fetch('/api/promotions').catch(() => null), // MỚI: chương trình khuyến mãi đang diễn ra
    fetch('/api/flash-sales').catch(() => null), // MỚI: chương trình Flash Sale (kể cả chưa tới giờ)
    fetch('/api/policies').catch(() => null) // MỚI: nội dung chính sách hiện ở cuối trang chủ
  ]);
  products = await productsRes.json();
  if(shippingRes && shippingRes.ok){
    shippingConfig = await shippingRes.json();
  }
  if(homepageRes && homepageRes.ok){
    homepageContent = await homepageRes.json();
  }
  if(addressRes && addressRes.ok){
    vnAddress = await addressRes.json();
  }
  if(categoriesRes && categoriesRes.ok){
    categoriesList = await categoriesRes.json();
  }
  if(promotionsRes && promotionsRes.ok){
    promotions = await promotionsRes.json();
  }
  if(flashSalesRes && flashSalesRes.ok){
    flashSales = await flashSalesRes.json();
  }
  if(policiesRes && policiesRes.ok){
    policiesContent = await policiesRes.json();
  }
  renderGrid();
  renderHeroSlide();   // MỚI
  renderCollections(); // MỚI
  renderFeaturedProducts(); // MỚI
  renderCategorySidebar(); // MỚI
  renderCategoryChips(); // MỚI: dải danh mục dạng chữ, hiện đủ trên mọi thiết bị
  renderHeroAndBelowSections(); // MỚI: khuyến mãi + Flash Sale (thay banner / dưới danh mục)
  renderTrustStrip(); // MỚI
  renderPolicySection(); // MỚI
  openSharedProductFromUrl(); // MỚI: nếu link có ?p=<mã sản phẩm> thì tự mở đúng sản phẩm đó
}

// MỚI: khách bấm vào link/mã QR chia sẻ 1 sản phẩm đang gom (dạng ?p=<mã sản phẩm>)
// thì tự mở popup chi tiết sản phẩm đó ngay khi vào trang, không cần lướt tìm.
function openSharedProductFromUrl(){
  const params = new URLSearchParams(window.location.search);
  const sharedId = params.get('p');
  if(!sharedId) return;
  const exists = products.find(p => String(p.id) === sharedId);
  if(exists) openProductDetail(sharedId, false);
}

// MỚI: banner trang chủ - lấy danh sách ảnh đã nhập (bỏ qua ô trống chưa nhập)
function getHeroSlides(){
  if(!homepageContent || !homepageContent.heroSlides) return [];
  return homepageContent.heroSlides.filter(s => s.image);
}
function renderHeroSlide(){
  const img = document.getElementById('heroSlideImg');
  if(!img) return;
  if(HOMEPAGE_LITE_MODE){
    img.style.display = 'none';
    document.querySelectorAll('.hero-arrow').forEach(btn => { btn.style.display = 'none'; });
    return;
  }
  const slides = getHeroSlides();
  if(slides.length === 0){
    // MỚI: không còn ảnh mặc định gắn cứng — nếu chưa cài banner nào thì giữ ẩn ảnh,
    // chỉ hiện nền màu trống (đỡ hơn là hiện nhầm ảnh cũ/sai)
    img.style.display = 'none';
    document.querySelectorAll('.hero-arrow').forEach(btn => { btn.style.display = 'none'; });
    return;
  }
  if(heroSlideIndex >= slides.length) heroSlideIndex = 0;
  const slide = slides[heroSlideIndex];
  img.src = slide.image;
  img.style.display = 'block'; // MỚI: chỉ hiện ảnh khi đã có src thật, tránh chớp ảnh cũ lúc tải trang
  if(slide.link){
    img.style.cursor = 'pointer';
    img.onclick = () => { window.location.href = slide.link; };
  } else {
    img.style.cursor = 'default';
    img.onclick = null;
  }
  // Chỉ hiện nút mũi tên khi có từ 2 ảnh trở lên
  document.querySelectorAll('.hero-arrow').forEach(btn => {
    btn.style.display = slides.length > 1 ? 'flex' : 'none';
  });
}
function heroPrevSlide(){
  const slides = getHeroSlides();
  if(slides.length === 0) return;
  heroSlideIndex = (heroSlideIndex - 1 + slides.length) % slides.length;
  renderHeroSlide();
}
function heroNextSlide(){
  const slides = getHeroSlides();
  if(slides.length === 0) return;
  heroSlideIndex = (heroSlideIndex + 1) % slides.length;
  renderHeroSlide();
}

// MỚI: dải bộ sưu tập nổi bật - giờ dùng để LỌC DANH MỤC (thay cho thanh chip đã bỏ)
// MỚI: bỏ qua các mục đang bị admin đánh dấu "hidden" (ẩn khỏi trang chủ), dù đã có ảnh
function renderCollections(){
  const wrap = document.getElementById('collections');
  if(!wrap) return;
  if(HOMEPAGE_LITE_MODE){ wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  const items = (homepageContent && homepageContent.collections)
    ? homepageContent.collections.filter(c => c.image && !c.hidden)
    : [];
  if(items.length === 0){ wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  wrap.style.display = 'grid';
  // MỚI: giới hạn số cột tối đa theo kích thước màn hình (điện thoại tối đa 3, tablet
  // tối đa 5, máy tính giữ mức rộng rãi như cũ) - để ảnh không bị co nhỏ dần khi có
  // nhiều danh mục; vượt quá số cột tối đa thì tự xuống thêm dòng thay vì thu nhỏ mãi
  const maxCols = window.innerWidth < 640 ? 3 : (window.innerWidth < 1024 ? 5 : 8);
  const cols = Math.min(maxCols, Math.max(1, Math.ceil(items.length / 2)));
  wrap.style.setProperty('--collections-cols', cols);
  wrap.innerHTML = items.map(c => `
    <div class="collection-tile" onclick="filterByCategory('${c.category || 'all'}')" style="cursor:pointer;">
      <img src="${c.image}" alt="${c.label || ''}">
      <div class="collection-label">${c.label || ''}</div>
    </div>
  `).join('');
}

// MỚI: tính lại số cột khi xoay ngang/dọc điện thoại hoặc kéo giãn cửa sổ trình duyệt
let collectionsResizeTimeout = null;
window.addEventListener('resize', () => {
  clearTimeout(collectionsResizeTimeout);
  collectionsResizeTimeout = setTimeout(renderCollections, 200);
});

// MỚI: lọc theo danh mục khi bấm vào 1 ảnh bộ sưu tập, tự cuộn xuống khu vực sản phẩm
function filterByCategory(cat){
  activeCat = cat;
  // MỚI: bấm "Xem tất cả" / chọn danh mục cũng xoá luôn từ khoá tìm kiếm đang gõ
  siteSearchQuery = '';
  const searchInput = document.getElementById('siteSearchInput');
  if(searchInput) searchInput.value = '';
  renderGrid();
  renderCategorySidebar(); // MỚI: tô sáng đúng mục đang chọn trong sidebar
  renderCategoryChips(); // MỚI: tô sáng đúng mục đang chọn trong dải chip
  document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
}

// MỚI: sidebar danh mục cố định bên trái (chỉ hiện trên desktop qua CSS), bấm để lọc
// giống hệt bấm vào ảnh bộ sưu tập — dùng chung danh sách danh mục từ /api/categories
function renderCategorySidebar(){
  const wrap = document.getElementById('categorySidebar');
  if(!wrap) return;
  const items = [{ key: 'all', label: 'Tất cả sản phẩm' }, ...categoriesList.map(c => ({ key: c.key, label: c.label }))];
  wrap.innerHTML = `
    <div class="category-sidebar-title">Danh mục</div>
    ${items.map(c => `
      <div class="category-sidebar-item ${activeCat === c.key ? 'active' : ''}" onclick="filterByCategory('${c.key}')">${c.label}</div>
    `).join('')}
  `;
}

// MỚI: dải danh mục dạng chữ (không cần ảnh) - hiện ĐỦ mọi danh mục đang có sản phẩm,
// cho mọi thiết bị (khối "Bộ sưu tập nổi bật" bằng ảnh chỉ hiện danh mục ĐÃ được gán ảnh,
// nên dải này bổ sung cho danh mục có sản phẩm mà admin chưa kịp thêm ảnh riêng)
function renderCategoryChips(){
  const wrap = document.getElementById('categoryChips');
  if(!wrap) return;
  const withProducts = categoriesList.filter(c => products.some(p => p.category === c.key && !p.hidden));
  if(withProducts.length === 0){ wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  const items = [{ key: 'all', label: 'Tất cả sản phẩm' }, ...withProducts.map(c => ({ key: c.key, label: c.label }))];
  wrap.innerHTML = items.map(c => `
    <div class="category-chip ${activeCat === c.key ? 'active' : ''}" onclick="filterByCategory('${c.key}')">${c.label}</div>
  `).join('');
}

// MỚI: nút nổi "Quay lại danh mục" (mobile/tablet) - hiện ra sau khi cuộn qua dải danh
// mục, cuộn mượt về đúng dải đó khi bấm
function scrollToCollections(){
  const target = document.getElementById('collections');
  if(target) target.scrollIntoView({ behavior: 'smooth' });
}
window.addEventListener('scroll', () => {
  const btn = document.getElementById('backToCategoriesBtn');
  const collectionsEl = document.getElementById('collections');
  if(!btn || !collectionsEl) return;
  const pastCollections = collectionsEl.getBoundingClientRect().bottom < 0;
  btn.style.display = pastCollections ? 'flex' : 'none';
}, { passive: true });

// MỚI: tìm kiếm sản phẩm theo tên, gõ tới đâu lọc tới đó
function handleSiteSearch(value){
  siteSearchQuery = value.trim().toLowerCase();
  renderGrid();
}

// MỚI: sản phẩm này mua 1 mình (ở mức giá thấp nhất) đã đủ điều kiện freeship chưa
// MỚI: mỗi quy tắc giờ có thể gồm nhiều danh mục (rule.targets), vẫn đọc được định dạng
// cũ (rule.category đơn lẻ) để không lỗi khi cấu hình cũ chưa kịp cập nhật
function qualifiesForFreeship(p){
  if(!shippingConfig || !shippingConfig.freeshipRules) return false;
  return shippingConfig.freeshipRules.some(rule => {
    if(!rule.active) return false;
    const targets = rule.targets && rule.targets.length ? rule.targets : [{ category: rule.category, minOrderValue: rule.minOrderValue }];
    return targets.some(t => {
      if(t.category === 'all') return p.priceMin >= t.minOrderValue;
      return t.category === p.category && p.priceMin >= t.minOrderValue;
    });
  });
}

function renderGrid(){
  const grid = document.getElementById('grid');
  const items = products.filter(p =>
    !p.hidden &&
    (activeCat==='all' || p.category===activeCat) &&
    (!siteSearchQuery || p.name.toLowerCase().includes(siteSearchQuery))
  );
  // MỚI: sản phẩm hết hàng luôn dồn xuống cuối TOÀN TRANG trước tiên (không theo từng
  // khối danh mục); trong số còn hàng, gom theo đúng khối danh mục - thứ tự khối lấy
  // đúng thứ tự đang sắp ở "Quản lý danh mục" bên trang quản trị; trong từng khối vẫn
  // giữ nguyên đúng thứ tự sản phẩm (ghim/mũi tên) đã cài đặt sẵn
  const categoryRank = new Map(categoriesList.map((c, i) => [c.key, i]));
  items.sort((a, b) => {
    const stockDiff = (a.totalStock <= 0 ? 1 : 0) - (b.totalStock <= 0 ? 1 : 0);
    if(stockDiff !== 0) return stockDiff;
    const catDiff = (categoryRank.get(a.category) ?? 999) - (categoryRank.get(b.category) ?? 999);
    return catDiff;
  });
  // MỚI: hiện nút "Xem tất cả" khi đang lọc danh mục hoặc đang tìm kiếm
  const resetLink = document.getElementById('resetFilterLink');
  if(resetLink) resetLink.style.display = (activeCat === 'all' && !siteSearchQuery) ? 'none' : 'inline';
  document.getElementById('resultCount').textContent = items.length + ' mẫu';
  grid.innerHTML = items.map(p => renderProductCard(p)).join('');
}

// MỚI: 1 thẻ sản phẩm - dùng chung cho lưới sản phẩm chính và khu "Sản phẩm nổi bật"
function renderProductCard(p){
  const outOfStock = p.totalStock <= 0;
  const imgTag = p.image ? `<img src="${p.image}" alt="${p.name}" loading="lazy">` : '';
  const freeshipBadge = qualifiesForFreeship(p) ? `<img src="images/freeship-badge.png" alt="Freeship" class="freeship-badge">` : '';
  // MỚI: nếu sản phẩm đang trong 1 chương trình khuyến mãi/Flash Sale, hiện giá gốc gạch
  // ngang + giá đã giảm + nhãn SALE - kể cả khi chương trình CHƯA tới giờ (nhãn đổi thành
  // "SẮP SALE" để khách biết đây là giá xem trước, chưa mua được ngay mức này)
  const priceRange = getEffectivePriceRange(p);
  const saleBadge = priceRange.onSale ? `<span class="sale-badge${priceRange.isActive ? '' : ' sale-badge-upcoming'}">${priceRange.isActive ? 'SALE' : 'SẮP SALE'}</span>` : '';
  const priceHtml = priceRange.onSale
    ? `<div class="card-price"><span class="card-price-old">${fmt(priceRange.originalMin)}</span>${fmt(priceRange.min)}${priceRange.min !== priceRange.max ? ' - ' + fmt(priceRange.max) : ''}</div>`
    : `<div class="card-price">${priceLabel(p)}</div>`;
  return `
    <div class="card ${outOfStock ? 'stock-out' : ''}" onclick="openProductDetail('${p.id}', true)">
      <div class="card-img">${saleBadge}${imgTag}${freeshipBadge}</div>
      <div class="card-body">
        <div class="card-tag">${outOfStock ? 'Hết hàng' : (p.variants.length > 1 ? p.variants.length + ' phân loại' : '')}</div>
        <div class="card-name">${p.name}</div>
        <div class="card-bottom">
          ${priceHtml}
          <button class="add-btn" onclick="event.stopPropagation(); handleQuickAdd('${p.id}')" ${outOfStock ? 'disabled' : ''}>+</button>
        </div>
      </div>
    </div>
  `;
}

// MỚI: khối "Cam kết/Uy tín" cuối trang chủ - admin tự thêm/sửa/xoá từng mục trong trang
// quản trị. Nếu homepageContent chưa có trustItems (site cũ chưa lưu lần nào), dùng tạm
// 3 mục mặc định giống hệt nội dung đang có sẵn trên web, để không bị trống đột ngột.
const DEFAULT_TRUST_ITEMS = [
  { icon: '🛒', title: 'Tự đặt hàng trực tiếp', text: 'Chọn sản phẩm, điền thông tin và gửi đơn — không cần nhắn tin chờ phản hồi.' },
  { icon: '🚚', title: 'Giao hàng qua SPX', text: 'Đóng gói cẩn thận, theo dõi đơn hàng dễ dàng từ lúc gửi đến khi nhận.' },
  { icon: '✋', title: 'Nhiều món làm thủ công', text: 'Bút dao, charm đính kèm được làm tay — blindbox nguyên seal, kiểm tra kỹ trước khi gửi.' }
];
function renderTrustStrip(){
  const wrap = document.getElementById('trustStrip');
  if(!wrap) return;
  const items = (homepageContent && homepageContent.trustItems && homepageContent.trustItems.length)
    ? homepageContent.trustItems
    : DEFAULT_TRUST_ITEMS;
  wrap.innerHTML = items.map(t => `
    <div class="trust-item">
      <div class="trust-icon">${t.icon || ''}</div>
      <div class="trust-text">
        <b>${t.title || ''}</b>
        <span>${t.text || ''}</span>
      </div>
    </div>
  `).join('');
}
function renderFeaturedProducts(){
  const wrap = document.getElementById('featuredProducts');
  if(!wrap) return;
  if(HOMEPAGE_LITE_MODE){ wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  const fp = homepageContent && homepageContent.featuredProducts;
  const ids = (fp && fp.productIds) || [];
  const items = ids.map(id => products.find(p => p.id === id)).filter(p => p && !p.hidden);
  if(items.length === 0){ wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  wrap.innerHTML = `
    <div class="section-head">
      <h2>${fp.title || 'Sản phẩm nổi bật'}</h2>
    </div>
    <div class="grid">${items.map(p => renderProductCard(p)).join('')}</div>
  `;
}

// ============================================================
// MỚI: Hiển thị Khuyến mãi + Flash Sale trên trang chủ - ở đúng vị trí admin đã chọn
// (thay banner chính / ngay dưới danh mục sản phẩm). CẢ HAI đều hiện trên trang chủ kèm
// đếm ngược TỪ TRƯỚC giờ bắt đầu - khách xem/thêm giỏ hàng được nhưng giá vẫn là giá gốc
// cho tới đúng giờ, tự đổi sang giá sale khi tới giờ. CẢ HAI đều dùng CHUNG 1 kiểu lưới cố
// định: 6 sản phẩm/dòng (laptop/máy tính bảng) và 5 sản phẩm/dòng (mobile) - không co giãn
// theo số lượng sản phẩm tham gia.
// Nếu Khuyến mãi và Flash Sale cùng chọn 1 vị trí hiển thị, Flash Sale được ưu tiên hiện -
// nên tránh chọn trùng vị trí giữa 2 chương trình.
// ============================================================

// Ghép danh sách sản phẩm đầy đủ (ảnh/tên/tồn kho...) cho các sản phẩm tham gia 1 chương trình
// (dùng chung cho cả khuyến mãi lẫn Flash Sale, vì cấu trúc "items" giống hệt nhau)
function getPromoProductsForDisplay(promoLike){
  return (promoLike.items || []).map(item => {
    const p = products.find(x => x.id === item.productId);
    if(!p || p.hidden) return null;
    return p;
  }).filter(Boolean);
}

// MỚI: định dạng thời gian đếm ngược dạng HH:MM:SS
function formatCountdown(ms){
  if(!(ms > 0)) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// MỚI: khối đếm ngược dùng chung cho cả Khuyến mãi lẫn Flash Sale - hiện "Bắt đầu sau" khi
// chưa tới giờ, tự đổi thành "Kết thúc sau" khi đã đang chạy
function renderCountdownHtml(program){
  const active = isProgramActiveNow(program);
  const now = new Date();
  const target = active ? (program.endAt ? new Date(program.endAt) : null) : (program.startAt ? new Date(program.startAt) : null);
  if(!target) return '';
  return `
    <div class="program-countdown" data-target="${target.toISOString()}">
      <span class="program-countdown-label">${active ? 'Kết thúc sau' : 'Bắt đầu sau'}</span>
      <span class="program-countdown-time">${formatCountdown(target - now)}</span>
    </div>`;
}

// MỚI: dựng nội dung khối Flash Sale (dùng chung cho vị trí "hero" và "below-categories")
function renderFlashSaleBlock(fs, gridId){
  const fsProducts = getPromoProductsForDisplay(fs);
  return `
    <div class="promo-head flashsale-head">
      <h2>⚡ ${fs.name || 'Flash Sale'}</h2>
      ${fs.description ? `<p>${fs.description}</p>` : ''}
      ${renderCountdownHtml(fs)}
    </div>
    <div class="flashsale-grid" id="${gridId}">${fsProducts.map(p => renderProductCard(p)).join('')}</div>
  `;
}

// MỚI: dựng nội dung khối Khuyến mãi (dùng chung cho vị trí "hero" và "below-categories") -
// dùng CHUNG lưới cố định "flashsale-grid" với Flash Sale (6 sản phẩm/dòng laptop/tablet,
// 5 sản phẩm/dòng mobile) - không còn tự co giãn số cột theo số lượng sản phẩm nữa
function renderPromoBlock(promo, gridId){
  const promoProducts = getPromoProductsForDisplay(promo);
  return `
    <div class="promo-head">
      <h2>🔥 ${promo.name || 'Chương trình khuyến mãi'}</h2>
      ${promo.description ? `<p>${promo.description}</p>` : ''}
      ${renderCountdownHtml(promo)}
    </div>
    <div class="flashsale-grid" id="${gridId}">${promoProducts.map(p => renderProductCard(p)).join('')}</div>
  `;
}

// MỚI: khối nào (khuyến mãi hay Flash Sale) đang "chiếm" từng vị trí hiển thị - Flash Sale ưu tiên hơn
function getHeroOccupant(){
  const flashHero = flashSales.find(f => f.displayPosition === 'hero');
  if(flashHero) return { type: 'flashsale', data: flashHero };
  const promoHero = promotions.find(p => p.displayPosition === 'hero');
  if(promoHero) return { type: 'promo', data: promoHero };
  return null;
}
function getBelowOccupant(){
  const flashBelow = flashSales.find(f => f.displayPosition === 'below-categories');
  if(flashBelow) return { type: 'flashsale', data: flashBelow };
  const promoBelow = promotions.find(p => p.displayPosition === 'below-categories');
  if(promoBelow) return { type: 'promo', data: promoBelow };
  return null;
}

function renderHeroSection(){
  const normalHero = document.getElementById('normalHeroSection');
  const section = document.getElementById('promoHeroSection');
  if(HOMEPAGE_LITE_MODE){
    if(normalHero) normalHero.style.display = 'none';
    if(section){ section.style.display = 'none'; section.innerHTML = ''; }
    return;
  }
  if(!section) return;
  const occupant = getHeroOccupant();
  if(!occupant){
    section.style.display = 'none';
    section.innerHTML = '';
    section.className = 'promo-section promo-hero';
    if(normalHero) normalHero.style.display = '';
    return;
  }
  if(normalHero) normalHero.style.display = 'none'; // MỚI: ẩn banner thường, thay bằng khối khuyến mãi/Flash Sale
  section.style.display = 'block';
  if(occupant.type === 'flashsale'){
    section.className = 'promo-section promo-hero flashsale-section';
    section.innerHTML = renderFlashSaleBlock(occupant.data, 'promoHeroGrid');
  } else {
    section.className = 'promo-section promo-hero';
    section.innerHTML = renderPromoBlock(occupant.data, 'promoHeroGrid');
  }
}

function renderBelowSection(){
  const section = document.getElementById('promoBelowSection');
  if(!section) return;
  if(HOMEPAGE_LITE_MODE){ section.style.display = 'none'; section.innerHTML = ''; return; }
  const occupant = getBelowOccupant();
  if(!occupant){
    section.style.display = 'none';
    section.innerHTML = '';
    section.className = 'promo-section';
    return;
  }
  section.style.display = 'block';
  if(occupant.type === 'flashsale'){
    section.className = 'promo-section flashsale-section';
    section.innerHTML = renderFlashSaleBlock(occupant.data, 'promoBelowGrid');
  } else {
    section.className = 'promo-section';
    section.innerHTML = renderPromoBlock(occupant.data, 'promoBelowGrid');
  }
}

function renderHeroAndBelowSections(){
  renderHeroSection();
  renderBelowSection();
}

// MỚI: mỗi giây cập nhật lại chữ đếm ngược của Khuyến mãi + Flash Sale (không tải lại dữ
// liệu, chỉ đổi chữ) - khi có khối vừa cán mốc bắt đầu/kết thúc thì tải lại dữ liệu ngay
function updateCountdownTexts(){
  const els = document.querySelectorAll('.program-countdown');
  if(els.length === 0) return;
  const now = new Date();
  let reachedTarget = false;
  els.forEach(el => {
    const targetStr = el.getAttribute('data-target');
    if(!targetStr) return;
    const diff = new Date(targetStr) - now;
    const timeEl = el.querySelector('.program-countdown-time');
    if(timeEl) timeEl.textContent = formatCountdown(diff);
    if(diff <= 0) reachedTarget = true;
  });
  // MỚI: vừa cán mốc bắt đầu/kết thúc -> tải lại ngay để đổi giá/badge đúng lúc
  if(reachedTarget) refreshPromoPrograms();
}
setInterval(updateCountdownTexts, 1000);

// MỚI: tải lại Khuyến mãi + Flash Sale định kỳ (bắt các thay đổi từ trang quản trị + đúng
// thời điểm bắt đầu/kết thúc/hết hạn) mà không cần tải lại cả trang
let promoProgramsRefreshing = false;
async function refreshPromoPrograms(){
  if(promoProgramsRefreshing) return;
  promoProgramsRefreshing = true;
  try{
    const [promotionsRes, flashSalesRes] = await Promise.all([
      fetch('/api/promotions').catch(() => null),
      fetch('/api/flash-sales').catch(() => null)
    ]);
    if(promotionsRes && promotionsRes.ok){ promotions = await promotionsRes.json(); }
    if(flashSalesRes && flashSalesRes.ok){ flashSales = await flashSalesRes.json(); }
    renderGrid();
    renderFeaturedProducts();
    renderHeroAndBelowSections();
  } catch(e){ /* im lặng bỏ qua, thử lại ở lượt làm mới sau */ }
  promoProgramsRefreshing = false;
}
setInterval(refreshPromoPrograms, 20000);

// MỚI: nút "+" vẫn thêm nhanh vào giỏ như trước (không mở trang chi tiết)
function handleQuickAdd(id){
  const p = products.find(x => x.id === id);
  if (!p || p.totalStock <= 0) return;
  const variants = getVariants(p);
  if (variants.length === 1) { addToCart(p.id, 0); } else { openVariantPicker(p); }
}

// ---------- Giỏ hàng ----------
function cartKey(id, variantIndex){ return `${id}::${variantIndex}`; }
// (selectedCartKeys đã khai báo cùng với "cart" ở đầu file, để tránh lỗi thứ tự khai báo)

// MỚI: thêm vào giỏ KHÔNG tự mở khay nữa - chỉ báo nhanh bằng toast rồi để khách tiếp
// tục xem/thêm sản phẩm khác thoải mái, khi nào muốn thanh toán tự bấm vào icon giỏ hàng
function addToCart(id, variantIndex){
  const key = cartKey(id, variantIndex);
  cart[key] = (cart[key]||0) + 1;
  selectedCartKeys.add(key); // MỚI: sản phẩm vừa thêm mặc định được tick chọn sẵn
  saveCart();
  updateCartUI();
  const p = products.find(x => x.id === id);
  showAddedToast(p ? `✓ Đã thêm "${p.name}" vào giỏ hàng` : '✓ Đã thêm vào giỏ hàng');
}

// MỚI: toast nhỏ báo đã thêm giỏ hàng thành công, tự ẩn sau ~1.8s
let addToCartToastTimeout = null;
function showAddedToast(message){
  let toast = document.getElementById('addToCartToast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'addToCartToast';
    toast.className = 'add-to-cart-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(addToCartToastTimeout);
  addToCartToastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 1800);
}
// MỚI: chọn 1 phân loại từ khay "Chọn phân loại" -> thêm vào giỏ rồi đóng khay lại luôn
// (thay vì nhảy sang xem giỏ hàng), để khách quay lại xem tiếp sản phẩm khác
function selectVariantAndClose(id, variantIndex){
  addToCart(id, variantIndex);
  closeDrawer();
}

function changeQty(id, variantIndex, delta){
  const key = cartKey(id, variantIndex);
  cart[key] = (cart[key]||0) + delta;
  if(cart[key] <= 0){ delete cart[key]; selectedCartKeys.delete(key); } // MỚI: bỏ tick nếu xoá hẳn
  saveCart();
  updateCartUI();
}
// MỚI: lấy các dòng trong giỏ ĐANG được tick chọn - dùng để tính tiền/đặt hàng, thay vì
// luôn dùng toàn bộ giỏ hàng
function getCheckoutEntries(){
  return cartEntries().filter(e => selectedCartKeys.has(cartKey(e.p.id, e.variantIndex)));
}
// MỚI: tick/bỏ tick 1 dòng trong giỏ
function toggleCartSelect(key, checked){
  if(checked) selectedCartKeys.add(key); else selectedCartKeys.delete(key);
  updateCartUI();
}
// MỚI: tick/bỏ tick tất cả các dòng đang có trong giỏ
function toggleSelectAllCart(checked){
  cartEntries().forEach(e => {
    const key = cartKey(e.p.id, e.variantIndex);
    if(checked) selectedCartKeys.add(key); else selectedCartKeys.delete(key);
  });
  updateCartUI();
}
function cartEntries(){
  return Object.entries(cart).map(([key, qty]) => {
    const [id, variantIndexStr] = key.split('::');
    const variantIndex = Number(variantIndexStr);
    const p = products.find(x => x.id === id);
    if (!p) return null;
    const baseVariant = getVariants(p)[variantIndex];
    if (!baseVariant) return null;
    // MỚI: nếu SKU này đang khuyến mãi/Flash Sale, dùng giá đã giảm để hiển thị trong giỏ
    // hàng - kể cả khi chương trình CHƯA tới giờ (để khách dễ hình dung). "onSale" chỉ để
    // biết có giá giảm để hiện; "saleIsActive" mới là đã THỰC SỰ tính tiền giá này hay chưa
    // (dùng để cảnh báo khách trong giỏ hàng nếu chương trình chưa bắt đầu)
    const vp = getVariantPromoPrice(id, variantIndex);
    const variant = vp ? { ...baseVariant, price: vp.discountedPrice, originalPrice: vp.originalPrice } : baseVariant;
    return { p, variantIndex, variant, qty, onSale: Boolean(vp), saleIsActive: vp ? vp.isActive : false };
  }).filter(Boolean);
}

function updateCartUI(){
  const entries = cartEntries();
  const totalQty = entries.reduce((s,e)=>s+e.qty,0);
  const totalPrice = entries.reduce((s,e)=>s+e.qty*e.variant.price,0);

  const countBadge = document.getElementById('cartCount');
  if(totalQty>0){ countBadge.style.display='flex'; countBadge.textContent = totalQty; }
  else { countBadge.style.display='none'; }

  const floatBar = document.getElementById('floatBar');
  if(totalQty>0 && drawerView !== 'success'){
    floatBar.classList.add('show');
    document.getElementById('floatCount').textContent = totalQty + ' món';
    document.getElementById('floatTotal').textContent = fmt(totalPrice);
  } else {
    floatBar.classList.remove('show');
  }
  renderDrawer();
}

// ---------- Chọn phân loại trước khi thêm giỏ ----------
function openVariantPicker(p){
  variantPickerProduct = p;
  drawerView = 'variant';
  renderDrawer();
  openDrawer();
}

// MỚI: HTML hiển thị giá 1 SKU - tự thêm giá gốc gạch ngang nếu SKU đó đang khuyến mãi/Flash
// Sale, kể cả khi chương trình CHƯA tới giờ (kèm chữ "(giá xem trước)" để khách biết rõ)
function variantPriceHtml(productId, variantIndex, basePrice){
  const vp = getVariantPromoPrice(productId, variantIndex);
  if(!vp) return fmt(basePrice);
  const pendingNote = vp.isActive ? '' : ' <span style="font-size:11px; color:#B26A00; font-weight:600;">(giá xem trước)</span>';
  return `<span class="card-price-old" style="font-size:12px;">${fmt(vp.originalPrice)}</span> ${fmt(vp.discountedPrice)}${pendingNote}`;
}

function renderVariantPicker(){
  const p = variantPickerProduct;
  const title = document.getElementById('drawerTitle');
  const list = document.getElementById('drawerList');
  title.textContent = 'Chọn phân loại';
  const imgTag = p.image ? `<div class="product-detail-img"><img src="${p.image}" alt="${p.name}"></div>` : '';
  const rows = getVariants(p).map((v, idx) => `
    <div class="variant-row ${v.stock<=0 ? 'disabled' : ''}" onclick="selectVariantAndClose('${p.id}', ${idx})">
      <div style="display:flex; align-items:center; gap:10px;">
        ${v.image ? `<img src="${v.image}" alt="" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex:0 0 auto;">` : ''}
        <div>
          <div class="vname">${v.name || 'Mặc định'}</div>
          <div class="vmeta">${v.stock>0 ? 'Còn ' + v.stock : 'Hết hàng'}</div>
        </div>
      </div>
      <div class="vprice">${variantPriceHtml(p.id, idx, v.price)}</div>
    </div>
  `).join('');
  list.innerHTML = `
    <div class="back-link" onclick="drawerView='cart'; renderDrawer();">← Quay lại giỏ hàng</div>
    ${imgTag}
    <div class="product-detail-name">${p.name}</div>
    <div class="variant-list">${rows}</div>
  `;
}

// ---------- MỚI: Trang chi tiết sản phẩm (link riêng /product/<id>) ----------
let currentDetailProduct = null;
let detailMainImageIndex = 0;

function openProductDetail(id, pushUrl){
  const p = products.find(x => x.id === id);
  if (!p) return;
  currentDetailProduct = p;
  detailMainImageIndex = 0;
  if (pushUrl) {
    history.pushState({ productId: id }, '', '/product/' + id);
  }
  renderProductDetail();
  document.getElementById('productDetailOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeProductDetail(pushUrl){
  document.getElementById('productDetailOverlay').classList.remove('show');
  document.body.style.overflow = '';
  currentDetailProduct = null;
  if (pushUrl) {
    history.pushState({}, '', '/');
  }
}

function renderProductDetail(){
  const p = currentDetailProduct;
  if (!p) return;
  const panel = document.getElementById('productDetailPanel');
  const variants = getVariants(p);
  const gallery = [p.image, ...(p.detailImages || [])].filter(Boolean);
  const mainImg = gallery[detailMainImageIndex] || gallery[0] || '';

  const thumbsHtml = gallery.map((img, idx) => `
    <img src="${img}" class="detail-thumb ${idx === detailMainImageIndex ? 'active' : ''}" onclick="detailMainImageIndex=${idx}; renderProductDetail();">
  `).join('');

  const variantsHtml = variants.map((v, idx) => `
    <div class="variant-row ${v.stock<=0 ? 'disabled' : ''}" onclick="addToCartFromDetail('${p.id}', ${idx})">
      <div style="display:flex; align-items:center; gap:10px;">
        ${v.image ? `<img src="${v.image}" alt="" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex:0 0 auto;">` : ''}
        <div>
          <div class="vname">${v.name || 'Mặc định'}</div>
          <div class="vmeta">${v.stock>0 ? 'Còn ' + v.stock : 'Hết hàng'}</div>
        </div>
      </div>
      <div class="vprice">${variantPriceHtml(p.id, idx, v.price)}</div>
    </div>
  `).join('');

  panel.innerHTML = `
    <div class="product-detail-close" onclick="closeProductDetail(true)">✕</div>
    <div class="detail-gallery">
      <div class="detail-main-img">${mainImg ? `<img src="${mainImg}" alt="${p.name}">` : '🎁'}</div>
      ${gallery.length > 1 ? `<div class="detail-thumbs">${thumbsHtml}</div>` : ''}
    </div>
    <div class="detail-info">
      <h2>${p.name}</h2>
      <div class="detail-price">${priceLabel(p)}</div>
      ${p.description ? `<p class="detail-desc">${p.description.replace(/\n/g, '<br>')}</p>` : ''}
      <div class="variant-list" style="margin-top:16px;">${variantsHtml}</div>
    </div>
  `;
}

// Thêm vào giỏ từ trang chi tiết: đóng trang chi tiết trước rồi mở khay giỏ hàng
function addToCartFromDetail(id, variantIndex){
  closeProductDetail(true);
  addToCart(id, variantIndex);
}

// Nút back của trình duyệt / bấm link chia sẻ trực tiếp -> tự mở đúng sản phẩm
window.addEventListener('popstate', () => {
  const match = window.location.pathname.match(/^\/product\/(.+)$/);
  if (match && products.length) {
    openProductDetail(decodeURIComponent(match[1]), false);
  } else {
    closeProductDetail(false);
  }
});


function openLookup(){
  lookupOrderResult = null;
  lookupOrderList = [];
  lookupError = '';
  selectedMergeOrderIds = new Set(); // MỚI
  mergeQuoteResult = null;           // MỚI
  mergeConfirmResult = null;         // MỚI
  wantMergeCod = false;              // MỚI
  drawerView = 'lookup';
  renderDrawer();
  openDrawer();
}

function renderLookupForm(){
  const title = document.getElementById('drawerTitle');
  const list = document.getElementById('drawerList');
  title.textContent = 'Tra cứu đơn hàng';
  list.innerHTML = `
    <p style="font-size:13px; color:var(--ink-soft); margin-bottom:14px;">Nhập số điện thoại lúc đặt để xem đơn hàng — không cần nhớ mã đơn. Nếu biết mã đơn, nhập thêm để tìm nhanh hơn.</p>
    <div class="form-field">
      <label>Số điện thoại đã đặt</label>
      <input type="tel" id="lk-phone" placeholder="09xxxxxxxx">
    </div>
    <div class="form-field">
      <label>Mã đơn hàng (không bắt buộc)</label>
      <input type="text" id="lk-order-id" placeholder="VD: 12">
    </div>
    ${lookupError ? `<p style="color:#B23A3A; font-size:13px; margin:6px 0;">${lookupError}</p>` : ''}
    <button class="checkout-btn" id="lookupBtn" onclick="submitLookup()">Tra cứu</button>
  `;
}

async function submitLookup(){
  const phone = document.getElementById('lk-phone').value.trim();
  const orderId = document.getElementById('lk-order-id').value.trim();
  if(!phone){
    lookupError = 'Nhập số điện thoại đã đặt hàng.';
    renderDrawer();
    return;
  }
  const btn = document.getElementById('lookupBtn');
  btn.disabled = true;
  btn.textContent = 'Đang tra cứu...';
  lookupPhone = phone;

  try{
    if(orderId){
      // Có mã đơn -> tìm đúng 1 đơn
      const res = await fetch('/api/orders/lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, phone })
      });
      const data = await res.json();
      if(!res.ok){ lookupError = data.error || 'Không tìm thấy đơn hàng.'; drawerView = 'lookup'; renderDrawer(); return; }
      lookupOrderResult = data;
      lookupError = '';
      drawerView = 'lookup-result';
      renderDrawer();
    } else {
      // Không có mã đơn -> liệt kê tất cả đơn theo SĐT để khách chọn
      const res = await fetch('/api/orders/find-by-phone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if(!res.ok){ lookupError = data.error || 'Không tìm thấy đơn hàng nào.'; drawerView = 'lookup'; renderDrawer(); return; }
      lookupOrderList = data;
      lookupError = '';
      drawerView = 'lookup-list';
      renderDrawer();
    }
  } catch(e){
    lookupError = 'Không kết nối được tới server, thử lại.';
    drawerView = 'lookup';
    renderDrawer();
  }
}

// MỚI: danh sách đơn hàng khi tra cứu chỉ bằng SĐT, bấm vào 1 đơn để xem chi tiết,
// hoặc tick chọn 2+ đơn cùng địa chỉ trong 24h để gộp lại tiết kiệm phí ship
function renderLookupList(){
  const title = document.getElementById('drawerTitle');
  const list = document.getElementById('drawerList');
  title.textContent = 'Đơn hàng của bạn';

  // MỚI: chỉ đơn chưa có mã vận đơn, chưa huỷ, chưa ở nhóm gộp khác mới được tick chọn
  const mergeable = o => !o.trackingCode && o.status !== 'huy' && !o.mergeGroupId;

  const rows = lookupOrderList.map(o => `
    <div class="variant-row" style="align-items:flex-start;">
      ${mergeable(o) ? `
        <input type="checkbox" ${selectedMergeOrderIds.has(o.id) ? 'checked' : ''}
          onchange="toggleMergeOrder(${o.id}, this.checked)" style="margin-top:4px; margin-right:8px;">
      ` : `<span style="width:16px; display:inline-block; margin-right:8px;"></span>`}
      <div style="flex:1; cursor:pointer;" onclick="selectLookupOrder(${o.id})">
        <div class="vname">Đơn #${o.id} — ${STATUS_LABEL[o.status] || o.status}</div>
        <div class="vmeta">${new Date(o.createdAt).toLocaleString('vi-VN')} · ${o.paid ? 'Đã thanh toán' : 'Chưa thanh toán'}${o.mergeGroupId ? ' · Đã gộp' : ''}</div>
      </div>
      <div class="vprice">${fmt(o.grandTotal)}</div>
    </div>
  `).join('');

  const mergeBarHtml = selectedMergeOrderIds.size >= 2 ? `
    <div class="qr-box" style="text-align:left; margin-top:12px;">
      <p style="font-weight:700; margin-bottom:6px;">Gộp ${selectedMergeOrderIds.size} đơn đã chọn?</p>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:10px;">Chỉ gộp được đơn cùng địa chỉ nhận hàng, còn trong hạn 24h kể từ đơn đầu tiên.</p>
      <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:10px; cursor:pointer;">
        <input type="checkbox" ${wantMergeCod ? 'checked' : ''} onchange="wantMergeCod=this.checked;">
        Trả phí ship gộp khi nhận hàng (SPX thu hộ, không cần chuyển khoản)
      </label>
      <button onclick="requestMergeQuote()" style="width:100%;">Tính thử phí ship gộp</button>
      <p id="mergeListMsg" style="font-size:13px; margin-top:8px; color:#B23A3A;"></p>
    </div>
  ` : (selectedMergeOrderIds.size === 1 ? `
    <p style="font-size:12px; color:var(--ink-soft); margin-top:10px;">Chọn thêm ít nhất 1 đơn cùng địa chỉ nữa để gộp.</p>
  ` : '');

  list.innerHTML = `
    <div class="back-link" onclick="openLookup()">← Tra cứu lại</div>
    <div class="variant-list">${rows}</div>
    ${mergeBarHtml}
  `;
}

// MỚI: tick/bỏ tick 1 đơn để đưa vào danh sách gộp
function toggleMergeOrder(id, checked){
  if(checked) selectedMergeOrderIds.add(id); else selectedMergeOrderIds.delete(id);
  renderLookupList();
}

// MỚI: gọi API tính thử phí ship gộp (chưa xác nhận, khách xem số tiền trước)
async function requestMergeQuote(){
  const msgEl = document.getElementById('mergeListMsg');
  if(msgEl) msgEl.textContent = 'Đang tính...';
  try{
    const res = await fetch('/api/orders/merge-quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds: Array.from(selectedMergeOrderIds), phone: lookupPhone, codShipping: wantMergeCod })
    });
    const data = await res.json();
    if(!res.ok){
      if(msgEl) msgEl.textContent = data.error || 'Không gộp được các đơn này.';
      return;
    }
    mergeQuoteResult = data;
    mergeConfirmResult = null;
    drawerView = 'lookup-merge';
    renderDrawer();
  } catch(e){
    if(msgEl) msgEl.textContent = 'Không kết nối được tới server, thử lại.';
  }
}

// MỚI: màn hình xem trước số tiền tiết kiệm được, bấm xác nhận thật thì mới lưu gộp + hiện QR
function renderLookupMergeResult(){
  const title = document.getElementById('drawerTitle');
  const list = document.getElementById('drawerList');
  title.textContent = 'Gộp đơn';

  if(mergeConfirmResult){
    const r = mergeConfirmResult;
    list.innerHTML = `
      <div class="back-link" onclick="openLookup()">← Về tra cứu đơn hàng</div>
      <div class="qr-box">
        <p style="font-weight:700; margin-bottom:10px;">Đã gộp ${r.orderIds.map(id => '#' + id).join(', ')} thành công</p>
        <p style="font-size:13px; margin-bottom:10px;">Tổng cân nặng ${r.combinedWeightGram}g — phí ship mới ${fmt(r.mergeShippingFee)}</p>
        ${r.codShipping
          ? `<p class="qr-note">Không cần chuyển khoản — SPX sẽ thu ${fmt(r.mergeShippingFee)} khi giao hàng.</p>`
          : (r.qrUrl ? `
            <img src="${r.qrUrl}" alt="Mã QR chuyển khoản" class="qr-img">
            <p class="qr-note">Quét mã để chuyển khoản đúng số tiền ${fmt(r.mergeShippingFee)} — giữ nguyên nội dung có sẵn để mình xác nhận nhanh hơn.</p>
          ` : '')
        }
      </div>
    `;
    return;
  }

  const r = mergeQuoteResult;
  list.innerHTML = `
    <div class="back-link" onclick="drawerView='lookup-list'; renderDrawer();">← Quay lại</div>
    <div class="qr-box">
      <p style="font-weight:700; margin-bottom:10px;">Tổng cân nặng ${r.orderIds.map(id => '#' + id).join(' + ')}</p>
      <p style="font-size:22px; font-weight:700; margin-bottom:6px;">${r.combinedWeightGram}g → phí ship mới ${fmt(r.newShippingFee)}</p>
      <p style="font-size:13px; color:var(--sage-deep); margin-bottom:14px;">Tiết kiệm ${fmt(r.saved)} so với gửi riêng (${fmt(r.oldShippingFeeSum)})</p>
      ${r.codShipping ? `<p style="font-size:12px; color:var(--ink-soft); margin-bottom:10px;">Đã chọn trả phí ship khi nhận hàng — không cần chuyển khoản, SPX thu hộ khi giao.</p>` : ''}
      <button onclick="confirmMerge()" style="width:100%; background:var(--sage-deep); color:#fff;">Xác nhận gộp đơn</button>
      <p id="mergeConfirmMsg" style="font-size:13px; margin-top:8px; color:#B23A3A;"></p>
    </div>
  `;
}

// MỚI: khách bấm xác nhận thật - lưu gộp vào các đơn, trả về QR trả phí ship gộp
async function confirmMerge(){
  const msgEl = document.getElementById('mergeConfirmMsg');
  if(msgEl) msgEl.textContent = 'Đang gộp...';
  try{
    const res = await fetch('/api/orders/merge-confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds: Array.from(selectedMergeOrderIds), phone: lookupPhone, codShipping: wantMergeCod })
    });
    const data = await res.json();
    if(!res.ok){
      if(msgEl) msgEl.textContent = data.error || 'Không gộp được, thử lại.';
      return;
    }
    mergeConfirmResult = data;
    selectedMergeOrderIds = new Set();
    renderDrawer();
  } catch(e){
    if(msgEl) msgEl.textContent = 'Không kết nối được tới server, thử lại.';
  }
}

// MỚI: chọn 1 đơn từ danh sách -> lấy chi tiết đầy đủ (kèm QR nếu chưa thanh toán)
async function selectLookupOrder(orderId){
  try{
    const res = await fetch('/api/orders/lookup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, phone: lookupPhone })
    });
    const data = await res.json();
    if(!res.ok){ lookupError = data.error || 'Không tìm thấy đơn hàng.'; drawerView = 'lookup'; renderDrawer(); return; }
    lookupOrderResult = data;
    drawerView = 'lookup-result';
    renderDrawer();
  } catch(e){
    lookupError = 'Không kết nối được tới server, thử lại.';
    drawerView = 'lookup';
    renderDrawer();
  }
}

function renderLookupResult(){
  const o = lookupOrderResult;
  const title = document.getElementById('drawerTitle');
  const list = document.getElementById('drawerList');
  title.textContent = `Đơn hàng #${o.id}`;

  const itemsHtml = o.items.map(it => `
    <div><span>${it.name}${it.variantName ? ' — ' + it.variantName : ''} × ${it.qty}</span><span>${fmt(it.price*it.qty)}</span></div>
  `).join('');

  const showShippingInfo = o.status === 'dang_giao' || o.status === 'da_giao' || o.status === 'hoan_thanh';
  const shippingInfoBlock = showShippingInfo ? `
    <div class="qr-box" style="text-align:left;">
      <p style="font-weight:700; margin-bottom:6px;">📦 Thông tin vận chuyển</p>
      <p style="font-size:13px; margin:2px 0;">Đơn vị vận chuyển: SPX (Shopee Express)</p>
      <p style="font-size:13px; margin:2px 0;">Mã vận đơn: ${o.trackingCode ? `<b>${o.trackingCode}</b>` : 'Đang cập nhật'}</p>
      <p style="font-size:13px; margin:2px 0;">Trạng thái: ${STATUS_LABEL[o.status] || o.status}</p>
      ${o.trackingCode ? `<a href="https://spx.vn/track" target="_blank" rel="noopener" style="display:inline-block; margin-top:8px; font-size:13px; font-weight:600; color:var(--rose-deep);">📦 Mở trang tra cứu SPX (dán mã ${o.trackingCode} vào ô tra cứu)</a>` : ''}
    </div>
  ` : '';

  // MỚI: cho khách tự huỷ đơn / đổi địa chỉ - chỉ khi đơn CHƯA có mã vận đơn
  const canModify = !o.trackingCode && o.status !== 'huy' && o.status !== 'hoan_thanh';
  const modifyActionsBlock = canModify ? `
    <div style="display:flex; gap:8px; margin:10px 0; flex-wrap:wrap;">
      <button onclick="openEditAddress()" style="font-size:13px; padding:9px 14px;">✏️ Đổi địa chỉ nhận hàng</button>
      <button class="danger" onclick="cancelMyOrder()" style="font-size:13px; padding:9px 14px;">Huỷ đơn hàng</button>
    </div>
  ` : '';

  // MỚI: nếu đơn chưa thanh toán, hiện lại mã QR để khách chuyển khoản
  const qrBlock = (!o.paid && o.qrUrl) ? `
    <div class="qr-box">
      <p style="font-weight:700; margin-bottom:10px;">Chưa nhận được thanh toán cho đơn này</p>
      <img src="${o.qrUrl}" alt="Mã QR chuyển khoản" class="qr-img">
      <p class="qr-note">Quét mã để chuyển khoản đúng số tiền ${fmt(o.dueAmount != null ? o.dueAmount : (o.grandTotal || o.total))}${o.codShipping ? ' (chưa gồm phí ship — phần này sẽ thu khi giao hàng)' : ''} — giữ nguyên nội dung có sẵn mã đơn <b>DH${o.id}</b> để mình xác nhận nhanh hơn.</p>
    </div>
  ` : '';

  list.innerHTML = `
    <div class="back-link" onclick="openLookup()">← Tra cứu đơn khác</div>
    <div class="foot-row"><span>Trạng thái</span><b>${STATUS_LABEL[o.status] || o.status}</b></div>
    <div class="foot-row"><span>Thanh toán</span><b>${o.paid ? 'Đã nhận tiền' : 'Chưa thanh toán'}</b></div>
    ${modifyActionsBlock}
    <div class="order-items" style="margin:12px 0;">${itemsHtml}</div>
    <div class="foot-row"><span>Tiền hàng</span><b>${fmt(o.total)}</b></div>
    <div class="foot-row"><span>Phí vận chuyển</span><b>${o.mergeGroupId ? 'Đã gộp với đơn khác' : (o.freeshipApplied ? 'Miễn phí' : fmt(o.shippingFee || 0))}${o.codShipping ? ' (thu khi giao)' : ''}</b></div>
    ${o.mergeGroupId ? `<div class="qr-box" style="text-align:left;"><p style="font-size:13px; margin:0;">Đơn này đã gộp chung với ${(o.mergeOrderIds || []).filter(id => id !== o.id).map(id => '#' + id).join(', ')} — phí ship gộp ${fmt(o.mergeShippingFee || 0)}, ${o.mergeShippingPaid ? 'đã thanh toán' : 'chưa thanh toán'}.</p></div>` : ''}
    ${o.giftWrap ? `<div class="foot-row"><span>🎁 Gói quà tặng</span><b>${o.giftWrapFee > 0 ? fmt(o.giftWrapFee) : 'Miễn phí'}</b></div>` : ''}
    ${(o.addOns && o.addOns.length) ? `<div class="foot-row"><span>🧩 ${o.addOns.map(a => a.label).join(', ')}</span><b>${fmt(o.addOnsFee || 0)}</b></div>` : ''}
    <div class="foot-row"><span>Tổng cộng</span><b>${fmt(o.grandTotal || o.total)}</b></div>
    ${shippingInfoBlock}
    ${qrBlock}
  `;
}

// MỚI: khách tự huỷ đơn - chỉ hiện khi đơn CHƯA có mã vận đơn (server tự kiểm tra lại)
async function cancelMyOrder(){
  const o = lookupOrderResult;
  if(!o) return;
  if(!confirm(`Huỷ đơn hàng #${o.id}? Không thể hoàn tác.`)) return;
  try{
    const res = await fetch('/api/orders/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: o.id, phone: lookupPhone })
    });
    const data = await res.json();
    if(!res.ok){ alert(data.error || 'Không huỷ được đơn hàng.'); return; }
    lookupOrderResult = data;
    renderDrawer();
  } catch(e){ alert('Không kết nối được tới server, thử lại.'); }
}

// MỚI: mở form đổi địa chỉ nhận hàng ngay trong khay tra cứu đơn
function openEditAddress(){
  drawerView = 'edit-address';
  renderDrawer();
}

function renderEditAddressForm(){
  const o = lookupOrderResult;
  const title = document.getElementById('drawerTitle');
  const list = document.getElementById('drawerList');
  title.textContent = 'Đổi địa chỉ nhận hàng';
  const provinceOptions = vnAddress
    ? vnAddress.provinces.map(p => `<option value="${p}" ${o.province===p?'selected':''}>${p}</option>`).join('')
    : '';
  list.innerHTML = `
    <div class="back-link" onclick="drawerView='lookup-result'; renderDrawer();">← Quay lại đơn hàng</div>
    <p style="font-size:13px; color:var(--ink-soft); margin-bottom:12px;">Địa chỉ hiện tại: ${o.address}</p>
    <div class="form-field searchable-select">
      <label>Tỉnh/Thành phố</label>
      <div class="searchable-select-box">
        <input type="text" id="cf-province-search" placeholder="Gõ để tìm Tỉnh/Thành phố..." autocomplete="off" value="${o.province || ''}"
          oninput="onProvinceSearchInput(this.value)" onfocus="onProvinceSearchInput(this.value)"
          onblur="setTimeout(()=>{const d=document.getElementById('cf-province-dropdown'); if(d) d.style.display='none';}, 150)">
        <input type="hidden" id="cf-province" value="${o.province || ''}">
        <div class="searchable-dropdown" id="cf-province-dropdown"></div>
      </div>
    </div>
    <div class="form-field searchable-select">
      <label>Xã/Phường</label>
      <div class="searchable-select-box">
        <input type="text" id="cf-ward-search" placeholder="${o.province ? 'Gõ để tìm Xã/Phường...' : 'Chọn Tỉnh/Thành trước'}" autocomplete="off" ${o.province ? '' : 'disabled'} value="${o.ward || ''}"
          oninput="onWardSearchInput(this.value)" onfocus="onWardSearchInput(this.value)"
          onblur="setTimeout(()=>{const d=document.getElementById('cf-ward-dropdown'); if(d) d.style.display='none';}, 150)">
        <input type="hidden" id="cf-ward" value="${o.ward || ''}">
        <div class="searchable-dropdown" id="cf-ward-dropdown"></div>
      </div>
    </div>
    <div class="form-field"><label>Địa chỉ chi tiết</label><textarea id="ea-address-detail" placeholder="Số nhà, tên đường...">${o.addressDetail || ''}</textarea></div>
    <button class="checkout-btn" id="saveAddressBtn" onclick="submitEditAddress()">Lưu địa chỉ mới</button>
    <p id="editAddressMsg" style="font-size:13px; margin-top:10px; color:#B23A3A;"></p>
  `;
}

async function submitEditAddress(){
  const o = lookupOrderResult;
  const province = document.getElementById('cf-province').value;
  const ward = document.getElementById('cf-ward').value;
  const addressDetail = document.getElementById('ea-address-detail').value.trim();
  const msgEl = document.getElementById('editAddressMsg');
  if(!province || !ward || !addressDetail){
    msgEl.textContent = 'Vui lòng chọn đủ Tỉnh/Thành, Xã/Phường và nhập địa chỉ chi tiết.';
    return;
  }
  const btn = document.getElementById('saveAddressBtn');
  btn.disabled = true; btn.textContent = 'Đang lưu...';
  try{
    const res = await fetch('/api/orders/update-address', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: o.id, phone: lookupPhone, province, ward, addressDetail })
    });
    const data = await res.json();
    if(!res.ok){
      msgEl.textContent = data.error || 'Không lưu được, thử lại.';
      btn.disabled = false; btn.textContent = 'Lưu địa chỉ mới';
      return;
    }
    lookupOrderResult = data;
    drawerView = 'lookup-result';
    renderDrawer();
  } catch(e){
    msgEl.textContent = 'Không kết nối được tới server, thử lại.';
    btn.disabled = false; btn.textContent = 'Lưu địa chỉ mới';
  }
}

// ---------- Vẽ nội dung khay ----------
function renderDrawer(){
  if (drawerView === 'variant') { renderVariantPicker(); return; }
  if (drawerView === 'lookup') { renderLookupForm(); return; }
  if (drawerView === 'lookup-list') { renderLookupList(); return; }
  if (drawerView === 'lookup-result') { renderLookupResult(); return; }
  if (drawerView === 'lookup-merge') { renderLookupMergeResult(); return; } // MỚI
  if (drawerView === 'edit-address') { renderEditAddressForm(); return; } // MỚI

  const entries = cartEntries(); // MỚI: toàn bộ sản phẩm đang có trong giỏ (không phân biệt đã tick hay chưa)
  const title = document.getElementById('drawerTitle');
  const list = document.getElementById('drawerList');

  if(drawerView === 'success'){
    title.textContent = 'Đặt hàng thành công';
    const shippingSummary = lastOrder ? `
      <div class="foot-row"><span>Tiền hàng</span><b>${fmt(lastOrder.total)}</b></div>
      <div class="foot-row"><span>Phí vận chuyển</span><b>${lastOrder.freeshipApplied ? 'Miễn phí (' + lastOrder.freeshipApplied + ')' : fmt(lastOrder.shippingFee || 0)}${lastOrder.codShipping ? ' (thu khi giao)' : ''}</b></div>
      ${lastOrder.giftWrap ? `<div class="foot-row"><span>🎁 Gói quà tặng</span><b>${lastOrder.giftWrapFee > 0 ? fmt(lastOrder.giftWrapFee) : 'Miễn phí'}</b></div>` : ''}
      ${(lastOrder.addOns && lastOrder.addOns.length) ? `<div class="foot-row"><span>🧩 ${lastOrder.addOns.map(a => a.label).join(', ')}</span><b>${fmt(lastOrder.addOnsFee || 0)}</b></div>` : ''}
      <div class="foot-row"><span>Tổng giá trị đơn</span><b>${fmt(lastOrder.grandTotal || lastOrder.total)}</b></div>
    ` : '';
    const qrBlock = lastOrder && lastOrder.qrUrl ? `
      <div class="qr-box">
        <img src="${lastOrder.qrUrl}" alt="Mã QR chuyển khoản" class="qr-img">
        <p class="qr-note">Quét mã để chuyển khoản đúng số tiền ${fmt(lastOrder.dueAmount != null ? lastOrder.dueAmount : (lastOrder.grandTotal || lastOrder.total))}${lastOrder.codShipping ? ' (chưa gồm phí ship — phần này sẽ thu khi giao hàng)' : ''} — giữ nguyên nội dung có sẵn mã đơn <b>DH${lastOrder.id}</b> để mình xác nhận nhanh hơn.</p>
      </div>
    ` : '';
    list.innerHTML = `
      <div class="success-box">
        <div class="emoji">🎉</div>
        <h3>Cảm ơn bạn đã đặt hàng!</h3>
        <p>Đơn hàng #${lastOrder ? lastOrder.id : ''} đã được ghi nhận. Mình sẽ liên hệ xác nhận và gửi hàng qua SPX sớm nhất.</p>
        <p style="font-size:13px; color:var(--ink-soft); margin-top:6px;">Chưa kịp chuyển khoản ngay? Không sao — vào mục "Tra cứu đơn hàng" ở đầu trang bất cứ lúc nào để xem lại mã QR này.</p>
      </div>
      ${shippingSummary}
      ${qrBlock}
    `;
    return;
  }

  if(drawerView === 'checkout'){
    const checkoutEntries = getCheckoutEntries(); // MỚI: chỉ đặt hàng đúng những sản phẩm đã tick chọn
    const total = checkoutEntries.reduce((s,e)=>s+e.qty*e.variant.price,0);
    // MỚI: cảnh báo nếu có sản phẩm đang hiện giá sale nhưng chương trình CHƯA tới giờ -
    // số tiền thật sẽ được server tính lại đúng (xem loadShippingPreview) và có thể cao hơn
    // tạm tính hiển thị ban đầu cho tới khi tải xong
    const hasPendingSaleItems = checkoutEntries.some(e => e.onSale && !e.saleIsActive);
    const pendingSaleNotice = hasPendingSaleItems ? `
      <div style="background:#FFF6E5; border:1px solid #F0D48A; border-radius:10px; padding:10px 12px; font-size:12px; color:#8A6100; margin-bottom:12px;">
        ⏳ Có sản phẩm đang hiện giá xem trước (chương trình sale chưa tới giờ chạy) - số tiền chính xác sẽ được tính lại ngay bên dưới, có thể cao hơn tạm tính ban đầu cho tới khi chương trình bắt đầu.
      </div>
    ` : '';
    title.textContent = 'Thông tin nhận hàng';
    list.innerHTML = `
      <div class="back-link" onclick="drawerView='cart'; renderDrawer();">← Quay lại giỏ hàng</div>
      ${pendingSaleNotice}
      <div class="form-field"><label>Họ tên</label><input type="text" id="cf-name" placeholder="Nguyễn Văn A" value="${escapeHtml(checkoutForm.customerName)}" oninput="checkoutForm.customerName=this.value"></div>
      <div class="form-field"><label>Số điện thoại</label><input type="tel" id="cf-phone" placeholder="09xxxxxxxx" value="${escapeHtml(checkoutForm.phone)}" oninput="checkoutForm.phone=this.value"></div>
      <div class="form-field"><label>Gmail (không bắt buộc - để nhận thông báo mã vận đơn)</label><input type="email" id="cf-email" placeholder="ban@gmail.com" value="${escapeHtml(checkoutForm.customerEmail || '')}" oninput="checkoutForm.customerEmail=this.value"></div>
      <div class="form-field searchable-select">
        <label>Tỉnh/Thành phố</label>
        <div class="searchable-select-box">
          <input type="text" id="cf-province-search" placeholder="Gõ để tìm Tỉnh/Thành phố..." autocomplete="off" value="${escapeHtml(checkoutForm.province)}"
            oninput="onProvinceSearchInput(this.value)" onfocus="onProvinceSearchInput(this.value)"
            onblur="setTimeout(()=>{const d=document.getElementById('cf-province-dropdown'); if(d) d.style.display='none';}, 150)">
          <input type="hidden" id="cf-province" value="${escapeHtml(checkoutForm.province)}">
          <div class="searchable-dropdown" id="cf-province-dropdown"></div>
        </div>
      </div>
      <div class="form-field searchable-select">
        <label>Xã/Phường</label>
        <div class="searchable-select-box">
          <input type="text" id="cf-ward-search" placeholder="${checkoutForm.province ? 'Gõ để tìm Xã/Phường...' : 'Chọn Tỉnh/Thành trước'}" autocomplete="off" ${checkoutForm.province ? '' : 'disabled'} value="${escapeHtml(checkoutForm.ward)}"
            oninput="onWardSearchInput(this.value)" onfocus="onWardSearchInput(this.value)"
            onblur="setTimeout(()=>{const d=document.getElementById('cf-ward-dropdown'); if(d) d.style.display='none';}, 150)">
          <input type="hidden" id="cf-ward" value="${escapeHtml(checkoutForm.ward)}">
          <div class="searchable-dropdown" id="cf-ward-dropdown"></div>
        </div>
      </div>
      <div class="form-field"><label>Địa chỉ chi tiết</label><textarea id="cf-address-detail" placeholder="Số nhà, tên đường..." oninput="checkoutForm.addressDetail=this.value">${escapeHtml(checkoutForm.addressDetail)}</textarea></div>
      <div class="form-field"><label>Ghi chú (không bắt buộc)</label><textarea id="cf-note" placeholder="Giao giờ hành chính, gọi trước khi giao..." oninput="checkoutForm.note=this.value">${escapeHtml(checkoutForm.note)}</textarea></div>
      ${renderGiftWrapCheckbox()}
      ${renderAddOnCheckboxes()}
      <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin:10px 0; cursor:pointer;">
        <input type="checkbox" ${wantCodShipping ? 'checked' : ''} onchange="toggleCodShippingCheckout(this.checked)">
        Trả phí ship khi nhận hàng (SPX thu hộ, không cần chuyển khoản phần này)
      </label>
      <div class="foot-row"><span>Tạm tính (${checkoutEntries.length} sản phẩm)</span><b id="cf-subtotal">${fmt(total)}</b></div>
      <div class="foot-row"><span>Phí vận chuyển</span><b id="cf-shipping-fee">Đang tính...</b></div>
      <div class="foot-row" id="cf-giftwrap-row" style="display:${wantGiftWrap ? 'flex' : 'none'};"><span>Phí gói quà</span><b id="cf-giftwrap-fee">Đang tính...</b></div>
      <div class="foot-row" id="cf-addons-row" style="display:${selectedAddOnIds.size > 0 ? 'flex' : 'none'};"><span>Dịch vụ kèm thêm</span><b id="cf-addons-fee">Đang tính...</b></div>
      <div class="foot-row"><span>Tổng giá trị đơn</span><b id="cf-grand-total">${fmt(total)}</b></div>
      <div class="foot-row" style="font-weight:700;"><span>${wantCodShipping ? 'Cần chuyển khoản (chưa gồm ship)' : 'Cần chuyển khoản'}</span><b id="cf-due-amount">${fmt(total)}</b></div>
      <button class="checkout-btn" id="submitOrderBtn" onclick="submitOrder()">Gửi đơn hàng</button>
    `;
    const previewItems = checkoutEntries.map(e => ({ id: e.p.id, variantIndex: e.variantIndex, qty: e.qty }));
    loadShippingPreview(previewItems);
    return;
  }

  title.textContent = 'Giỏ hàng';
  if(entries.length===0){
    list.innerHTML = `<div class="drawer-empty">Giỏ hàng đang trống — thêm vài món dễ thương nhé 🎁</div>`;
    return;
  }
  // MỚI: chỉ đóng gói/tính tiền những sản phẩm đang được TICK CHỌN, không phải cả giỏ
  const checkoutEntries = getCheckoutEntries();
  const allSelected = entries.length > 0 && entries.every(e => selectedCartKeys.has(cartKey(e.p.id, e.variantIndex)));
  const selectedTotal = checkoutEntries.reduce((s,e)=>s+e.qty*e.variant.price,0);
  // MỚI: cảnh báo nếu trong giỏ có sản phẩm đang hiện giá sale NHƯNG chương trình chưa tới
  // giờ bắt đầu - để khách biết đây là giá xem trước, số tiền thật lúc đặt hàng vẫn tính
  // giá gốc cho tới đúng giờ (tránh khách hiểu lầm/thắc mắc khi thấy số tiền đổi khác)
  const hasPendingSaleItems = entries.some(e => e.onSale && !e.saleIsActive);
  const pendingSaleNotice = hasPendingSaleItems ? `
    <div style="background:#FFF6E5; border:1px solid #F0D48A; border-radius:10px; padding:10px 12px; font-size:12px; color:#8A6100; margin-bottom:12px;">
      ⏳ Giá gạch ngang cho vài sản phẩm là giá <b>xem trước</b> khi chương trình bắt đầu - hiện chưa tới giờ nên vẫn tính giá gốc, hệ thống sẽ tự tính lại đúng giá sale ngay khi chương trình chạy.
    </div>
  ` : '';
  const selectAllRow = `
    <label style="display:flex; align-items:center; gap:8px; padding:6px 0 12px; border-bottom:1px solid var(--line); margin-bottom:8px; font-size:13px; font-weight:600;">
      <input type="checkbox" ${allSelected ? 'checked' : ''} onchange="toggleSelectAllCart(this.checked)"> Chọn tất cả (${entries.length} sản phẩm)
    </label>
  `;
  const itemsHtml = entries.map(e => {
    const key = cartKey(e.p.id, e.variantIndex);
    const checked = selectedCartKeys.has(key);
    return `
    <div class="line-item">
      <input type="checkbox" class="cart-item-check" ${checked ? 'checked' : ''} onchange="toggleCartSelect('${key}', this.checked)">
      <div class="li-icon">${(e.variant.image || e.p.image) ? `<img src="${e.variant.image || e.p.image}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : '🎁'}</div>
      <div class="li-body">
        <div class="li-name">${e.p.name}${e.variant.name ? ' — ' + e.variant.name : ''}</div>
        <div class="li-price">${e.onSale ? `<span class="card-price-old" style="font-size:11px;">${fmt(e.variant.originalPrice)}</span> ` : ''}${fmt(e.variant.price)}${e.onSale && !e.saleIsActive ? ' <span style="font-size:11px; color:#B26A00; font-weight:600;">(giá xem trước)</span>' : ''}</div>
      </div>
      <div class="li-qty">
        <button class="qty-btn" onclick="changeQty('${e.p.id}', ${e.variantIndex}, -1)">−</button>
        <div class="qty-val">${e.qty}</div>
        <button class="qty-btn" onclick="changeQty('${e.p.id}', ${e.variantIndex}, 1)">+</button>
      </div>
    </div>
  `;
  }).join('');
  list.innerHTML = `
    ${pendingSaleNotice}
    ${selectAllRow}
    ${itemsHtml}
    <div class="foot-row" style="margin-top:14px;"><span>Tạm tính (${checkoutEntries.length} sản phẩm đã chọn)</span><b>${fmt(selectedTotal)}</b></div>
    <button class="checkout-btn" onclick="proceedToCheckout()" ${checkoutEntries.length === 0 ? 'disabled' : ''}>Tiến hành đặt hàng</button>
  `;
}

// MỚI: bỏ dấu tiếng Việt để so khớp tìm kiếm không phân biệt có dấu/không dấu
// (khách gõ "ha noi" vẫn tìm ra "Hà Nội")
function normalizeVN(str){
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

// MỚI: gõ tìm Tỉnh/Thành phố - lọc danh sách, hiện gợi ý bên dưới ô nhập
function onProvinceSearchInput(value){
  const dropdown = document.getElementById('cf-province-dropdown');
  if(!dropdown) return;
  if(!vnAddress){ dropdown.style.display = 'none'; return; }
  const q = normalizeVN(value.trim());
  const matches = vnAddress.provinces.filter(p => !q || normalizeVN(p).includes(q)).slice(0, 50);
  dropdown.innerHTML = matches.length
    ? matches.map(p => `<div class="searchable-dropdown-item" onmousedown="selectProvince('${p.replace(/'/g, "\\'")}')">${p}</div>`).join('')
    : `<div class="searchable-dropdown-empty">Không tìm thấy Tỉnh/Thành phù hợp</div>`;
  dropdown.style.display = 'block';
}

// MỚI: chọn 1 Tỉnh/Thành từ gợi ý - lưu vào ô ẩn (giữ nguyên id cf-province để không
// phải sửa lại submitOrder), rồi tự nạp lại danh sách Xã/Phường tương ứng
function selectProvince(name){
  document.getElementById('cf-province').value = name;
  document.getElementById('cf-province-search').value = name;
  document.getElementById('cf-province-dropdown').style.display = 'none';
  checkoutForm.province = name; // MỚI
  onProvinceChange();
}

// MỚI: khi đổi Tỉnh/Thành, reset lại ô Xã/Phường (bật/tắt được gõ tìm) tương ứng
function onProvinceChange(){
  const province = document.getElementById('cf-province').value;
  const wardHidden = document.getElementById('cf-ward');
  const wardSearch = document.getElementById('cf-ward-search');
  const wardDropdown = document.getElementById('cf-ward-dropdown');
  wardHidden.value = '';
  wardSearch.value = '';
  wardSearch.disabled = !province;
  wardSearch.placeholder = province ? 'Gõ để tìm Xã/Phường...' : 'Chọn Tỉnh/Thành trước';
  if(wardDropdown) wardDropdown.style.display = 'none';
  checkoutForm.ward = ''; // MỚI
}

// MỚI: gõ tìm Xã/Phường (chỉ trong phạm vi Tỉnh/Thành đã chọn)
function onWardSearchInput(value){
  const dropdown = document.getElementById('cf-ward-dropdown');
  if(!dropdown) return;
  const province = document.getElementById('cf-province').value;
  if(!province){ dropdown.style.display = 'none'; return; }
  const wards = (vnAddress && vnAddress.wardsByProvince[province]) ? vnAddress.wardsByProvince[province] : [];
  const q = normalizeVN(value.trim());
  const matches = wards.filter(w => !q || normalizeVN(w).includes(q)).slice(0, 80);
  dropdown.innerHTML = matches.length
    ? matches.map(w => `<div class="searchable-dropdown-item" onmousedown="selectWard('${w.replace(/'/g, "\\'")}')">${w}</div>`).join('')
    : `<div class="searchable-dropdown-empty">Không tìm thấy Xã/Phường phù hợp</div>`;
  dropdown.style.display = 'block';
}

// MỚI: chọn 1 Xã/Phường từ gợi ý
function selectWard(name){
  document.getElementById('cf-ward').value = name;
  document.getElementById('cf-ward-search').value = name;
  document.getElementById('cf-ward-dropdown').style.display = 'none';
  checkoutForm.ward = name; // MỚI
}

// MỚI: bật/tắt trả ship khi nhận hàng NGAY tại bước nhập thông tin - vẽ lại màn hình
// nhưng toàn bộ ô đã gõ (tên/sđt/địa chỉ/ghi chú) được điền lại từ checkoutForm nên
// không bị mất, chỉ có số tiền cần chuyển khoản được tính lại cho đúng
function toggleCodShippingCheckout(checked){
  wantCodShipping = checked;
  renderDrawer();
}

// MỚI: bật/tắt gói quà - cập nhật dòng phí gói quà + gọi lại xem trước tổng tiền
function toggleGiftWrap(checked){
  wantGiftWrap = checked;
  const row = document.getElementById('cf-giftwrap-row');
  if(row) row.style.display = checked ? 'flex' : 'none';
  const previewItems = getCheckoutEntries().map(e => ({ id: e.p.id, variantIndex: e.variantIndex, qty: e.qty }));
  loadShippingPreview(previewItems);
}

// MỚI: bật/tắt 1 dịch vụ/sản phẩm kèm thêm - cập nhật dòng phí + gọi lại xem trước tổng tiền
function toggleAddOn(id, checked){
  id = String(id);
  if(checked) selectedAddOnIds.add(id); else selectedAddOnIds.delete(id);
  const row = document.getElementById('cf-addons-row');
  if(row) row.style.display = selectedAddOnIds.size > 0 ? 'flex' : 'none';
  const previewItems = getCheckoutEntries().map(e => ({ id: e.p.id, variantIndex: e.variantIndex, qty: e.qty }));
  loadShippingPreview(previewItems);
}

// MỚI: chuyển sang màn điền thông tin nhận hàng, chỉ khi có ít nhất 1 sản phẩm đang tick chọn
function proceedToCheckout(){
  if(getCheckoutEntries().length === 0){
    alert('Chọn ít nhất 1 sản phẩm trong giỏ để đặt hàng.');
    return;
  }
  drawerView = 'checkout';
  renderDrawer();
}

async function loadShippingPreview(items){
  const feeEl = document.getElementById('cf-shipping-fee');
  const grandEl = document.getElementById('cf-grand-total');
  if(!feeEl || !grandEl) return;
  try{
    const res = await fetch('/api/shipping-estimate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, wantGiftWrap, selectedAddOnIds: Array.from(selectedAddOnIds) }) // MỚI: gửi kèm lựa chọn gói quà + dịch vụ kèm thêm
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Lỗi tính phí ship');
    const feeElNow = document.getElementById('cf-shipping-fee');
    const grandElNow = document.getElementById('cf-grand-total');
    const subtotalElNow = document.getElementById('cf-subtotal'); // MỚI
    const giftWrapFeeElNow = document.getElementById('cf-giftwrap-fee');
    const addOnsFeeElNow = document.getElementById('cf-addons-fee'); // MỚI
    if(!feeElNow || !grandElNow) return;
    // MỚI: cập nhật lại "Tạm tính" theo ĐÚNG giá server tính (có thể khác giá xem trước ở
    // giỏ hàng nếu có sản phẩm đang trong chương trình sale chưa tới giờ chạy)
    if(subtotalElNow && typeof data.total === 'number') subtotalElNow.textContent = fmt(data.total);
    feeElNow.textContent = data.freeshipApplied ? `Miễn phí (Freeship: ${data.freeshipApplied})` : fmt(data.shippingFee);
    if(giftWrapFeeElNow) giftWrapFeeElNow.textContent = data.giftWrapFee > 0 ? fmt(data.giftWrapFee) : 'Miễn phí';
    if(addOnsFeeElNow) addOnsFeeElNow.textContent = fmt(data.addOnsFee || 0); // MỚI
    grandElNow.textContent = fmt(data.grandTotal);
    // MỚI: "Cần chuyển khoản" = tổng - phí ship nếu chọn trả ship khi nhận hàng (và thực sự có phí ship)
    const dueElNow = document.getElementById('cf-due-amount');
    if(dueElNow){
      const due = (wantCodShipping && data.shippingFee > 0)
        ? data.grandTotal - data.shippingFee
        : data.grandTotal;
      dueElNow.textContent = fmt(due);
    }
  } catch(e){
    const feeElNow = document.getElementById('cf-shipping-fee');
    if(feeElNow) feeElNow.textContent = 'Sẽ báo khi xác nhận đơn';
  }
}

// ---------- Gửi đơn hàng lên server ----------
async function submitOrder(){
  const customerName = document.getElementById('cf-name').value.trim();
  const phone = document.getElementById('cf-phone').value.trim();
  const customerEmail = document.getElementById('cf-email').value.trim(); // MỚI: nhận thông báo mã vận đơn
  const province = document.getElementById('cf-province').value; // MỚI
  const ward = document.getElementById('cf-ward').value;         // MỚI
  const addressDetail = document.getElementById('cf-address-detail').value.trim(); // MỚI
  const note = document.getElementById('cf-note').value.trim();

  if(!customerName || !phone || !province || !ward || !addressDetail){
    alert('Vui lòng điền đầy đủ họ tên, số điện thoại, Tỉnh/Thành, Xã/Phường và địa chỉ chi tiết.');
    return;
  }
  if(customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)){
    alert('Email chưa đúng định dạng, kiểm tra lại giúp mình.');
    return;
  }

  // MỚI: chỉ gửi đúng những sản phẩm đang được tick chọn, không phải cả giỏ hàng
  const checkoutEntries = getCheckoutEntries();
  const items = checkoutEntries.map(e => ({ id: e.p.id, variantIndex: e.variantIndex, qty: e.qty }));

  const btn = document.getElementById('submitOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Đang gửi...';

  try{
    const res = await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName, phone, customerEmail, province, ward, addressDetail, note, items, wantGiftWrap, selectedAddOnIds: Array.from(selectedAddOnIds), codShipping: wantCodShipping }) // MỚI: customerEmail, codShipping
    });
    if(!res.ok){
      const err = await res.json();
      alert(err.error || 'Có lỗi xảy ra, thử lại nhé.');
      btn.disabled = false; btn.textContent = 'Gửi đơn hàng';
      return;
    }
    lastOrder = await res.json();
    // MỚI: chỉ xoá khỏi giỏ đúng những sản phẩm vừa đặt - sản phẩm chưa tick chọn vẫn
    // giữ nguyên trong giỏ để khách đặt tiếp ở lần sau
    checkoutEntries.forEach(e => {
      const key = cartKey(e.p.id, e.variantIndex);
      delete cart[key];
      selectedCartKeys.delete(key);
    });
    saveCart();
    wantGiftWrap = false; // MỚI: reset lại lựa chọn gói quà cho lần đặt hàng tiếp theo
    selectedAddOnIds = new Set(); // MỚI: reset lại lựa chọn dịch vụ kèm thêm
    wantCodShipping = false; // MỚI: reset lại lựa chọn trả ship khi nhận hàng
    checkoutForm = { customerName: '', phone: '', customerEmail: '', province: '', ward: '', addressDetail: '', note: '' }; // MỚI
    drawerView = 'success';
    updateCartUI();
  } catch(e){
    alert('Không kết nối được tới server. Kiểm tra lại kết nối mạng.');
    btn.disabled = false; btn.textContent = 'Gửi đơn hàng';
  }
}

// MỚI: khối chính sách (điều khoản, vận chuyển, đổi trả, bảo mật, thanh toán) hiện ở
// cuối trang chủ - dạng accordion (bấm để mở/đóng từng mục), nội dung lấy từ tab
// "Chính sách" trong trang quản trị. Bắt buộc phải có + hiển thị được để hồ sơ thông
// báo website với Bộ Công Thương được duyệt.
const POLICY_ORDER = ['about', 'terms', 'shipping', 'returns', 'privacy', 'payment', 'contact'];
function renderPolicySection(){
  const wrap = document.getElementById('policySection');
  if(!wrap) return;
  // BẢN GOM ĐƠN: ẩn hẳn khối Chính sách trên trang chủ khách, không cần cho công cụ
  // đặt đơn + quản lý kho vận
  if(HOMEPAGE_LITE_MODE){ wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  if(!policiesContent) return;
  wrap.innerHTML = `
    <h2 style="margin-bottom:14px;">Chính sách</h2>
    ${POLICY_ORDER.map((key, i) => `
      <div class="policy-item" id="policy-${key}">
        <div class="policy-item-head" onclick="togglePolicyItem(${i})">
          <span>${escapeHtml(policiesContent[key].title)}</span>
          <span id="policyArrow${i}">▾</span>
        </div>
        <div class="policy-item-body" id="policyBody${i}" style="display:none;">${escapeHtml(policiesContent[key].content)}</div>
      </div>
    `).join('')}
  `;
}
function togglePolicyItem(i){
  const body = document.getElementById(`policyBody${i}`);
  const arrow = document.getElementById(`policyArrow${i}`);
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  arrow.textContent = open ? '▾' : '▴';
}

function openDrawer(){
  if(drawerView === 'success') drawerView = 'cart';
  document.getElementById('overlay').classList.add('show');
  document.getElementById('drawer').classList.add('show');
  renderDrawer();
}
function closeDrawer(){
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('drawer').classList.remove('show');
  if(['success','variant','lookup','lookup-list','lookup-result','edit-address'].includes(drawerView)) drawerView = 'cart';
}

loadProducts().then(() => {
  updateCartUI();
  // MỚI: nếu khách vào thẳng link /product/<id>, tự mở đúng trang chi tiết đó
  const match = window.location.pathname.match(/^\/product\/(.+)$/);
  if (match) {
    openProductDetail(decodeURIComponent(match[1]), false);
  }
});

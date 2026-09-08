// ============================================================
// admin.js - trang quản trị (Gift Lab)
// ============================================================

let adminKey = sessionStorage.getItem('giftlab_admin_key') || '';
let orders = [];
let products = [];
let productSearch = '';
let expandedProductId = null;
let expandedShareId = null; // MỚI: sản phẩm đang mở khung "Chia sẻ đợt gom" (link + mã QR)
let productPage = 1;               // MỚI: phân trang sản phẩm
const PRODUCTS_PER_PAGE = 60;
let orderPhoneFilter = '';         // MỚI: lọc đơn hàng theo SĐT
let orderStatusFilter = 'all';     // MỚI: lọc đơn hàng theo trạng thái
let orderSourceFilter = 'all';     // MỚI: lọc đơn hàng theo nguồn (website / tách đơn Messenger)
let selectedOrderIds = new Set();  // MỚI: các đơn đang được tick chọn
// MỚI: cấu hình ship đang chỉnh trong tab Vận chuyển
let shippingConfig = null;
let shippingLoaded = false;
let homepageContent = null; // MỚI: banner + bộ sưu tập trang chủ
let homepageLoaded = false;
let categories = [];        // MỚI: danh mục sản phẩm (tự thêm/sửa/xoá được), mỗi phần tử {key, label}
let categoriesLoaded = false;
let productCategoryFilter = 'all'; // MỚI: lọc danh sách sản phẩm theo danh mục
let productStatusFilter = 'all';   // MỚI: lọc theo trạng thái hiển thị/tồn kho
let expandedCategoryKey = null;    // MỚI: danh mục đang mở để quản lý sản phẩm bên trong
let categoryProductSearch = '';    // MỚI: tìm sản phẩm trong khu quản lý danh mục
let categoryProductViewFilter = 'all'; // MỚI: 'all' = xem tất cả sản phẩm, 'in-category' = chỉ xem sản phẩm đang thuộc danh mục này
let categoryProductPage = 1;       // MỚI: phân trang trong khu quản lý sản phẩm theo danh mục
let featuredProductSearch = '';    // MỚI: tìm sản phẩm để thêm vào "Sản phẩm nổi bật" trang chủ
let selectedCategoryProductIds = new Set(); // MỚI: sản phẩm đang tick chọn trong khu quản lý danh mục
let selectedProductIds = new Set();  // MỚI: sản phẩm đang tick chọn trong danh sách chính (để ẩn/xoá/sửa hàng loạt)
let bulkEditPriceMode = 'set';       // MỚI: 'set' = đặt giá cố định, 'pct' = tăng/giảm theo %

// ---------- MỚI: Khuyến mãi ----------
let promotions = [];               // toàn bộ chương trình khuyến mãi (admin quản lý)
let promotionsLoaded = false;
let policiesContent = null; // MỚI: nội dung 5 trang chính sách (điều khoản, vận chuyển, đổi trả, bảo mật, thanh toán)
let policiesLoaded = false;
let expandedPromoId = null;        // chương trình đang mở để chỉnh sửa
let promoProductSearch = '';       // tìm sản phẩm để thêm vào chương trình đang mở
let promoProductCategoryFilter = 'all'; // lọc theo danh mục khi tìm sản phẩm thêm vào
let promoExpandedSkuProductId = null;   // sản phẩm đang mở để sửa từng SKU riêng
let promoSelectedProductIds = new Set(); // sản phẩm đang tick chọn để thêm vào chương trình đang mở

// ---------- MỚI: Flash Sale (thiết lập giống hệt Khuyến mãi, khác ở cách hiển thị trang chủ) ----------
let flashSales = [];               // toàn bộ chương trình Flash Sale (admin quản lý)
let flashSalesLoaded = false;
let expandedFlashSaleId = null;        // chương trình đang mở để chỉnh sửa
let flashSaleProductSearch = '';       // tìm sản phẩm để thêm vào chương trình đang mở
let flashSaleProductCategoryFilter = 'all'; // lọc theo danh mục khi tìm sản phẩm thêm vào
let flashSaleExpandedSkuProductId = null;   // sản phẩm đang mở để sửa từng SKU riêng
let flashSaleSelectedProductIds = new Set(); // sản phẩm đang tick chọn để thêm vào chương trình đang mở

const STATUS_LABEL = {
  moi: 'Mới',
  cho_giao: 'Chờ giao hàng',
  dang_giao: 'Đang giao',
  da_giao: 'Đã giao - chờ xác nhận', // MỚI: sau 2 ngày tự động chuyển sang Hoàn thành
  hoan_thanh: 'Hoàn thành',
  huy: 'Đã hủy'
};
// MỚI: trả về tên hiển thị của 1 danh mục theo key, dùng thay cho CAT_LABEL cố định trước đây
function catLabel(key){
  const c = categories.find(c => c.key === key);
  return c ? c.label : key;
}

// MỚI: chuyển ký tự đặc biệt HTML (<, >, &, ", ') thành mã an toàn trước khi chèn vào
// innerHTML - bắt buộc với mọi dữ liệu do admin/khách tự nhập (tên sản phẩm, tên danh
// mục...). Thiếu bước này, tên sản phẩm chứa ký tự như "<3", "&", dấu ngoặc kép... sẽ
// làm hỏng cấu trúc HTML của cả khối đang render, khiến các nút/checkbox phía sau nó
// bấm không có phản ứng gì (chính là lỗi checkbox "Chọn tất cả" gặp phải).
function escapeHtml(str){
  if(str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(n){ return n.toLocaleString('vi-VN') + 'đ'; }

// ---------- Đăng nhập ----------
async function login(){
  const key = document.getElementById('adminKeyInput').value.trim();
  if(!key) return;
  adminKey = key;
  const ok = await tryLoadOrders();
  if(ok){
    sessionStorage.setItem('giftlab_admin_key', adminKey);
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('adminView').style.display = 'block';
    loadProducts();
  } else {
    document.getElementById('loginError').textContent = 'Sai mật khẩu, thử lại.';
  }
}
function logout(){
  sessionStorage.removeItem('giftlab_admin_key');
  location.reload();
}

async function apiFetch(url, opts={}){
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
      ...(opts.headers||{})
    }
  });
  return res;
}

// ---------- Tabs ----------
document.addEventListener('click', (e)=>{
  const tab = e.target.closest('.tab');
  if(!tab) return;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById('ordersTab').style.display = tab.dataset.tab==='orders' ? 'block' : 'none';
  document.getElementById('productsTab').style.display = tab.dataset.tab==='products' ? 'block' : 'none';
  // MỚI: hiện/ẩn tab Vận chuyển, tự tải cấu hình lần đầu bấm vào
  document.getElementById('shippingTab').style.display = tab.dataset.tab==='shipping' ? 'block' : 'none';
  if(tab.dataset.tab==='shipping' && !shippingLoaded){
    loadShippingSettings();
  }
  // MỚI: tab Trang chủ
  document.getElementById('homepageTab').style.display = tab.dataset.tab==='homepage' ? 'block' : 'none';
  if(tab.dataset.tab==='homepage' && !homepageLoaded){
    loadHomepageSettings();
  }
  // MỚI: tab Khuyến mãi
  document.getElementById('promotionsTab').style.display = tab.dataset.tab==='promotions' ? 'block' : 'none';
  if(tab.dataset.tab==='promotions' && !promotionsLoaded){
    loadPromotionsSettings();
  }
  // MỚI: tab Flash Sale
  document.getElementById('flashsaleTab').style.display = tab.dataset.tab==='flashsale' ? 'block' : 'none';
  if(tab.dataset.tab==='flashsale' && !flashSalesLoaded){
    loadFlashSaleSettings();
  }
  // MỚI: tab Chính sách
  document.getElementById('policiesTab').style.display = tab.dataset.tab==='policies' ? 'block' : 'none';
  if(tab.dataset.tab==='policies' && !policiesLoaded){
    loadPoliciesSettings();
  }
});

// ---------- Đơn hàng ----------
async function tryLoadOrders(){
  const res = await apiFetch('/api/orders');
  if(!res.ok) return false;
  orders = await res.json();
  renderOrders();
  return true;
}

function renderOrders(){
  const wrap = document.getElementById('ordersTab');
  if(orders.length===0){
    wrap.innerHTML = `<p style="color:var(--ink-soft); font-size:14px;">Chưa có đơn hàng nào.</p>`;
    return;
  }

  // MỚI: lọc theo SĐT (chứa chuỗi nhập), theo trạng thái và theo nguồn tạo đơn
  const filtered = orders.filter(o => {
    const matchPhone = !orderPhoneFilter.trim() || String(o.phone).includes(orderPhoneFilter.trim());
    const matchStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
    const matchSource = orderSourceFilter === 'all' || (o.source || 'website') === orderSourceFilter;
    return matchPhone && matchStatus && matchSource;
  });

  // MỚI: bỏ chọn những đơn không còn hiện trong danh sách đã lọc (tránh chọn "ẩn")
  const filteredIds = new Set(filtered.map(o => o.id));
  selectedOrderIds.forEach(id => { if(!filteredIds.has(id)) selectedOrderIds.delete(id); });
  const allSelected = filtered.length > 0 && filtered.every(o => selectedOrderIds.has(o.id));

  const filterBar = `
    <div class="form-row" style="margin-bottom:14px;">
      <div class="form-field">
        <input id="orderPhoneFilterInput" placeholder="Tìm theo số điện thoại..." value="${orderPhoneFilter}" oninput="orderPhoneFilter=this.value; renderOrders();">
      </div>
      <div class="form-field">
        <select style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--line);" onchange="orderStatusFilter=this.value; renderOrders();">
          <option value="all" ${orderStatusFilter==='all'?'selected':''}>Tất cả trạng thái</option>
          ${Object.entries(STATUS_LABEL).map(([k,v]) => `<option value="${k}" ${orderStatusFilter===k?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <select style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--line);" onchange="orderSourceFilter=this.value; renderOrders();">
          <option value="all" ${orderSourceFilter==='all'?'selected':''}>Tất cả nguồn đơn</option>
          <option value="website" ${orderSourceFilter==='website'?'selected':''}>Khách tự đặt trên web</option>
          <option value="tach-don" ${orderSourceFilter==='tach-don'?'selected':''}>Tách đơn (Messenger)</option>
        </select>
      </div>
    </div>
  `;

  if(filtered.length === 0){
    wrap.innerHTML = filterBar + `<p style="color:var(--ink-soft); font-size:14px;">Không có đơn nào khớp bộ lọc.</p>`;
    return;
  }

  // MỚI: thanh chọn hàng loạt - chọn tất cả, tải Excel gắn mã vận đơn, xuất Excel,
  // huỷ tất cả / xoá tất cả các đơn đã tick chọn
  const bulkBar = `
    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:14px; background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px;">
      <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600;">
        <input type="checkbox" ${allSelected ? 'checked' : ''} onchange="toggleSelectAllOrders(this.checked)"> Chọn tất cả (${filtered.length})
      </label>
      <span style="font-size:13px; color:var(--ink-soft);">Đã chọn: ${selectedOrderIds.size}</span>
      ${selectedOrderIds.size > 0 ? `
        <button class="danger" onclick="bulkCancelOrders()" style="font-size:12px;">Huỷ tất cả đã chọn</button>
        <button class="danger" onclick="bulkDeleteOrders()" style="font-size:12px;">Xoá tất cả đã chọn</button>
      ` : ''}
      <label style="margin-left:auto; font-size:12px; background:var(--sage-deep); color:#fff; padding:8px 14px; border-radius:8px; cursor:pointer; font-weight:600;">
        📥 Tải Excel gắn mã vận đơn
        <input type="file" accept=".xlsx,.xls" style="display:none;" onchange="handleTrackingExcelUpload(this)">
      </label>
      <button onclick="exportSpxExcel()" style="font-size:12px; background:var(--rose-deep); color:#fff; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-weight:600;">📤 Xuất Excel lên đơn SPX</button>
    </div>
  `;

  wrap.innerHTML = filterBar + bulkBar + `<p style="font-size:12px; color:var(--ink-soft); margin-bottom:8px;">${filtered.length} / ${orders.length} đơn hàng</p>` +
    filtered.map(o => `
    <div class="order-card">
      <div class="order-top">
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" ${selectedOrderIds.has(o.id) ? 'checked' : ''} onchange="toggleSelectOrder(${o.id}, this.checked)">
          <b>${escapeHtml(o.customerName)}</b>
        </label>
        <div style="display:flex; gap:6px;">
          ${(o.source === 'tach-don') ? `<span class="badge" style="background:#EDE6D6; color:#565F52;">Tách đơn</span>` : ''}
          <span class="badge ${o.paid ? 'paid' : 'unpaid'}">${o.paid ? 'Đã thanh toán' : 'Chưa thanh toán'}</span>
          <span class="badge ${o.status}">${STATUS_LABEL[o.status]}</span>
        </div>
      </div>
      <div class="order-meta">
        ${escapeHtml(o.phone)} · ${escapeHtml(o.address)}
        ${!o.trackingCode ? `<button onclick="toggleAddressEdit(${o.id})" style="font-size:11px; padding:3px 8px; margin-left:6px;">${expandedAddressEditId===o.id ? 'Đóng' : 'Sửa địa chỉ'}</button>` : ' <span style="color:var(--ink-soft);">(đã có mã vận đơn, không sửa được)</span>'}
        <br>
        ${new Date(o.createdAt).toLocaleString('vi-VN')}
        ${o.note ? `<br>Ghi chú: ${escapeHtml(o.note)}` : ''}
      </div>
      ${expandedAddressEditId===o.id ? renderAddressEditForm(o) : ''}
      <div class="order-items">
        ${o.items.map(it => `<div><span>${escapeHtml(it.name)}${it.variantName ? ' — ' + escapeHtml(it.variantName) : ''} × ${it.qty}</span><span>${fmt(it.price*it.qty)}</span></div>`).join('')}
      </div>
      <div class="order-meta" style="margin-top:4px;">
        Phí ship: ${fmt(o.shippingFee || 0)}${o.freeshipApplied ? ` · <span style="color:var(--sage-deep); font-weight:600;">Freeship (${escapeHtml(o.freeshipApplied)})</span>` : ''}${o.giftWrap ? ` · <span style="color:#B23A3A; font-weight:600;">🎁 Gói quà (${o.giftWrapFee > 0 ? fmt(o.giftWrapFee) : 'miễn phí'})</span>` : ''}${(o.addOns && o.addOns.length) ? ` · <span style="color:var(--sage-deep); font-weight:600;">🧩 ${o.addOns.map(a => escapeHtml(a.label)).join(', ')} (${fmt(o.addOnsFee || 0)})</span>` : ''}
      </div>
      ${o.mergeGroupId ? `
        <div class="order-meta" style="margin-top:4px; background:#F3F0FF; border-radius:8px; padding:6px 10px;">
          <span style="color:var(--sage-deep); font-weight:600;">🔗 Gộp đơn #${o.mergeGroupId}</span> — cùng gộp với ${(o.mergeOrderIds || []).filter(oid => oid !== o.id).map(oid => 'DH' + oid).join(', ')}
          · Phí ship gộp: ${fmt(o.mergeShippingFee || 0)}
          ${o.mergeShippingCod
            ? ` · <span style="color:#B23A3A; font-weight:600;">🚚 Thu khi giao (COD)</span>`
            : `<label style="margin-left:8px;"><input type="checkbox" ${o.mergeShippingPaid ? 'checked' : ''} onchange="updateMergeShippingPaid(${o.id}, this.checked)"> Đã thu phí ship gộp</label>`
          }
        </div>
      ` : (o.codShipping ? `
        <div class="order-meta" style="margin-top:4px; background:#FFF4E5; border-radius:8px; padding:6px 10px;">
          <span style="color:#B23A3A; font-weight:600;">🚚 Phí ship ${fmt(o.shippingFee || 0)} thu khi giao (COD)</span> — chỉ cần chuyển khoản tiền hàng
        </div>
      ` : '')}
      <div style="display:flex; gap:8px; align-items:center; margin:8px 0; flex-wrap:wrap;">
        <input type="text" id="tracking-${o.id}" placeholder="Mã vận đơn SPX (nếu có)" value="${escapeHtml(o.trackingCode || '')}" style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid var(--line); font-size:13px;">
        <button onclick="updateTracking(${o.id})">Lưu mã vận đơn</button>
        ${o.trackingCode ? `<a href="https://spx.vn/track" target="_blank" rel="noopener" style="font-size:12px; padding:8px 12px; border-radius:8px; border:1px solid var(--line); background:#fff; color:var(--rose-deep); font-weight:600; text-decoration:none;">📦 Tra cứu SPX (dán mã: ${escapeHtml(o.trackingCode)})</a>` : ''}
      </div>
      <div class="order-top">
        <b>Tổng cộng: ${fmt(o.grandTotal || o.total)}${o.codShipping ? ` <span style="font-weight:400; font-size:12px; color:var(--ink-soft);">(cần CK: ${fmt((o.total||0) + (o.giftWrapFee||0) + (o.addOnsFee||0))})</span>` : ''}</b>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <label style="display:flex; align-items:center; gap:4px; font-size:13px;">
            <input type="checkbox" ${o.paid?'checked':''} onchange="updatePaid(${o.id}, this.checked)"> Đã nhận tiền
          </label>
          <select class="status-select" onchange="updateStatus(${o.id}, this.value)">
            ${Object.entries(STATUS_LABEL).map(([k,v]) => `<option value="${k}" ${o.status===k?'selected':''}>${v}</option>`).join('')}
          </select>
          ${(!o.trackingCode && o.status !== 'huy' && o.status !== 'hoan_thanh') ? `<button class="danger" onclick="cancelOrder(${o.id})">Huỷ đơn</button>` : ''}
          <button class="danger" onclick="deleteOrder(${o.id})">Xoá</button>
        </div>
      </div>
    </div>
  `).join('');
}

// MỚI: mở/đóng form sửa địa chỉ ngay trong thẻ đơn hàng
let expandedAddressEditId = null;
function toggleAddressEdit(id){
  expandedAddressEditId = expandedAddressEditId === id ? null : id;
  renderOrders();
}
function renderAddressEditForm(o){
  return `
    <div style="background:#FAFAFC; border:1px solid var(--line); border-radius:10px; padding:12px; margin:8px 0;">
      <div class="form-row">
        <div class="form-field"><label>Tỉnh/Thành phố</label><input type="text" id="addr-province-${o.id}" value="${escapeHtml(o.province || '')}"></div>
        <div class="form-field"><label>Xã/Phường</label><input type="text" id="addr-ward-${o.id}" value="${escapeHtml(o.ward || '')}"></div>
      </div>
      <div class="form-field"><label>Địa chỉ chi tiết</label><input type="text" id="addr-detail-${o.id}" value="${escapeHtml(o.addressDetail || '')}"></div>
      <button onclick="saveAddressEdit(${o.id})">Lưu địa chỉ mới</button>
      <p id="addr-msg-${o.id}" style="font-size:12px; margin-top:6px; color:#B23A3A;"></p>
    </div>
  `;
}
async function saveAddressEdit(id){
  const province = document.getElementById(`addr-province-${id}`).value.trim();
  const ward = document.getElementById(`addr-ward-${id}`).value.trim();
  const addressDetail = document.getElementById(`addr-detail-${id}`).value.trim();
  const msgEl = document.getElementById(`addr-msg-${id}`);
  if(!province || !ward || !addressDetail){
    msgEl.textContent = 'Nhập đủ Tỉnh/Thành, Xã/Phường và địa chỉ chi tiết.';
    return;
  }
  const res = await apiFetch(`/api/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ province, ward, addressDetail }) });
  if(res.ok){ expandedAddressEditId = null; await tryLoadOrders(); }
  else { const data = await res.json().catch(() => ({})); msgEl.textContent = data.error || 'Không lưu được, thử lại.'; }
}

// MỚI: huỷ đơn hàng - chỉ cho phép khi đơn CHƯA có mã vận đơn (server cũng tự kiểm tra lại)
async function cancelOrder(id){
  if(!confirm(`Huỷ đơn hàng #${id}? Không thể hoàn tác.`)) return;
  const res = await apiFetch(`/api/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'huy' }) });
  if(res.ok){ await tryLoadOrders(); }
  else { const data = await res.json().catch(() => ({})); alert(data.error || 'Không huỷ được đơn hàng.'); }
}

// MỚI: chọn / bỏ chọn 1 đơn
function toggleSelectOrder(id, checked){
  if(checked) selectedOrderIds.add(id); else selectedOrderIds.delete(id);
  renderOrders();
}
// MỚI: chọn / bỏ chọn tất cả đơn đang hiện (theo bộ lọc hiện tại)
function toggleSelectAllOrders(checked){
  const filtered = orders.filter(o => {
    const matchPhone = !orderPhoneFilter.trim() || String(o.phone).includes(orderPhoneFilter.trim());
    const matchStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
    return matchPhone && matchStatus;
  });
  if(checked){ filtered.forEach(o => selectedOrderIds.add(o.id)); }
  else { filtered.forEach(o => selectedOrderIds.delete(o.id)); }
  renderOrders();
}

// MỚI: huỷ hàng loạt các đơn đã tick chọn - gọi lại đúng API huỷ từng đơn 1 (giữ
// nguyên các kiểm tra sẵn có: chặn đơn đã có mã vận đơn, hoàn trả tồn kho khi huỷ).
// Đơn nào không huỷ được (VD đã có mã vận đơn) sẽ được báo riêng, các đơn còn lại vẫn huỷ bình thường.
async function bulkCancelOrders(){
  const ids = Array.from(selectedOrderIds);
  if(ids.length === 0) return;
  if(!confirm(`Huỷ ${ids.length} đơn hàng đã chọn? Không thể hoàn tác.`)) return;
  const failed = [];
  for(const id of ids){
    const res = await apiFetch(`/api/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'huy' }) });
    if(!res.ok) failed.push(id);
  }
  selectedOrderIds.clear();
  await tryLoadOrders();
  if(failed.length){
    alert(`Không huỷ được ${failed.length} đơn (có thể đã có mã vận đơn): #${failed.join(', #')}`);
  }
}

// MỚI: xoá hàng loạt các đơn đã tick chọn - gọi lại đúng API xoá từng đơn 1
async function bulkDeleteOrders(){
  const ids = Array.from(selectedOrderIds);
  if(ids.length === 0) return;
  if(!confirm(`Xoá hẳn ${ids.length} đơn hàng đã chọn? Không thể hoàn tác.`)) return;
  const failed = [];
  for(const id of ids){
    const res = await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
    if(!res.ok) failed.push(id);
  }
  selectedOrderIds.clear();
  await tryLoadOrders();
  if(failed.length){
    alert(`Không xoá được ${failed.length} đơn: #${failed.join(', #')}`);
  }
}


// MỚI: xoá thủ công 1 đơn hàng (đơn rác/trùng/spam)
async function deleteOrder(id){
  if(!confirm(`Xoá hẳn đơn hàng #${id}? Không thể hoàn tác.`)) return;
  const res = await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
  if(res.ok){ selectedOrderIds.delete(id); await tryLoadOrders(); }
  else { alert('Không xoá được đơn hàng.'); }
}

// MỚI: đọc file Excel gắn mã vận đơn hàng loạt (2 cột: Mã đơn hàng, Mã vận đơn)
// rồi tự cập nhật trackingCode + chuyển trạng thái sang "Đang giao" cho các đơn đó
async function handleTrackingExcelUpload(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      // Chấp nhận vài kiểu tên cột khác nhau cho dễ dùng
      const updates = rows.map(r => {
        const orderId = r['Mã đơn hàng'] ?? r['ID'] ?? r['id'] ?? r['Mã đơn'];
        const trackingCode = r['Mã vận đơn'] ?? r['TrackingCode'] ?? r['Tracking'] ?? r['Mã vận đơn SPX'];
        return { id: orderId, trackingCode: trackingCode ? String(trackingCode).trim() : '', status: 'dang_giao' };
      }).filter(u => u.id !== undefined && u.id !== '' && u.trackingCode);

      if(updates.length === 0){
        alert('Không đọc được dữ liệu — file cần có cột "Mã đơn hàng" và "Mã vận đơn".');
        input.value = '';
        return;
      }

      const res = await apiFetch('/api/orders/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ updates })
      });
      const result = await res.json();
      if(res.ok){
        alert(`Đã cập nhật ${result.success.length} đơn.${result.notFound.length ? ` Không tìm thấy ${result.notFound.length} mã đơn: ${result.notFound.join(', ')}` : ''}`);
        await tryLoadOrders();
      } else {
        alert(result.error || 'Cập nhật hàng loạt thất bại.');
      }
    } catch(err){
      alert('Không đọc được file Excel, kiểm tra lại định dạng file.');
    }
    input.value = '';
  };
  reader.readAsArrayBuffer(file);
}

// MỚI: xuất Excel để lên đơn hàng loạt trên SPX - đúng cấu trúc cột SPX yêu cầu
// (sheet "Tạo đơn (địa chỉ mới)" - định dạng 2 cấp Tỉnh/Xã, không có Quận/Huyện)
const SPX_HEADERS = [
  '*Mã đơn hàng','*Tên người nhận','*Số điện thoại','*Tỉnh/Thành Phố','*Xã/Phường',
  '*Địa chỉ chi tiết','Lưu ý về địa chỉ','Mã bưu chính','*Tên sản phẩm',
  'Số lượng (Thông tin bắt buộc khi chọn Giao hàng một phần & Thu COD)',
  'Giá tiền (Thông tin bắt buộc khi chọn Giao hàng một phần & Thu COD)',
  '*Tổng cân nặng bưu gửi (KG)','Chiều dài (CM)','Chiều rộng (CM)','Chiều cao (CM)',
  'Mã khách hàng','*Giá trị đơn hàng','*Giao hàng một phần (Y/N)','*Cho phép thử hàng (Y/N)',
  '*Cho xem hàng, không cho thử (Y/N)','Thu phí từ chối nhận hàng (Y/N)','Phí từ chối nhận hàng cần thu',
  '*Thu COD (Y/N)','Số tiền COD','bưu gửi giá trị cao (Y/N)','*Hình thức thanh Toán',
  'Lưu ý giao hàng','Nhắc nhở điền đúng số tiền COD','Đơn chỉ hoàn thành nếu ở dưới hiện "Đủ điều kiện"'
];

function exportSpxExcel(){
  if(selectedOrderIds.size === 0){
    alert('Chưa chọn đơn nào — tick chọn ít nhất 1 đơn (hoặc bấm "Chọn tất cả") trước khi xuất.');
    return;
  }
  const selected = orders.filter(o => selectedOrderIds.has(o.id));
  const missing = selected.filter(o => !o.province || !o.ward || !o.addressDetail);
  const validOrders = selected.filter(o => o.province && o.ward && o.addressDetail);

  if(missing.length > 0){
    const proceed = confirm(`${missing.length} đơn chưa có Tỉnh/Xã (đơn đặt trước khi có form mới) sẽ bị bỏ qua khi xuất.\nTiếp tục xuất ${validOrders.length} đơn còn lại?`);
    if(!proceed) return;
  }
  if(validOrders.length === 0){
    alert('Không có đơn nào đủ Tỉnh/Xã để xuất.');
    return;
  }

  const rows = [SPX_HEADERS];
  validOrders.forEach(o => {
    // Cân nặng: lấy tổng cân nặng đã tính lúc đặt hàng; đơn rất cũ chưa có thì tạm dùng 0.5kg
    const weightKg = o.totalWeightGram ? Math.round((o.totalWeightGram / 1000) * 100) / 100 : 0.5;
    // MỚI: nếu khách chọn trả phí ship khi nhận hàng, báo SPX thu hộ đúng số tiền đó.
    // Với đơn đã gộp, chỉ báo COD trên đúng 1 đơn đại diện (id nhỏ nhất trong nhóm =
    // đơn được ship gộp cùng gói hàng), tránh báo trùng nhiều lần cho cùng 1 gói.
    let codAmount = 0;
    if (o.mergeGroupId) {
      if (o.mergeShippingCod && o.id === o.mergeGroupId) codAmount = o.mergeShippingFee || 0;
    } else if (o.codShipping) {
      codAmount = o.shippingFee || 0;
    }
    const hasCod = codAmount > 0;
    (o.items || []).forEach((item, idx) => {
      const productName = item.name + (item.variantName ? ' - ' + item.variantName : '');
      if (idx === 0) {
        rows.push([
          `DH${o.id}`, o.customerName, o.phone, o.province, o.ward,
          o.addressDetail, o.note || '', '', productName,
          item.qty, item.price,
          weightKg, '', '', '',
          '', o.total, 'N', 'N',
          'N', '', '',
          hasCod ? 'Y' : 'N', hasCod ? codAmount : '', 'N', 'Người gửi trả',
          '', '', ''
        ]);
      } else {
        // Sản phẩm thứ 2 trở đi trong cùng 1 đơn: chỉ cần Mã đơn hàng + Tên sản phẩm + Số lượng + Giá tiền
        rows.push([
          `DH${o.id}`, '', '', '', '',
          '', '', '', productName,
          item.qty, item.price,
          '', '', '', '',
          '', '', '', '',
          '', '', '',
          '', '', '', '',
          '', '', ''
        ]);
      }
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tạo đơn (địa chỉ mới)');
  const fileName = `giftlab-spx-orders-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

async function updateStatus(id, status){
  const res = await apiFetch(`/api/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  if(res.ok){ await tryLoadOrders(); } else {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Không cập nhật được trạng thái.');
    await tryLoadOrders(); // MỚI: tải lại để dropdown trả về đúng trạng thái cũ (tránh hiện sai trên UI)
  }
}
async function updatePaid(id, paid){
  const res = await apiFetch(`/api/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ paid }) });
  if(res.ok){ await tryLoadOrders(); } else { alert('Không cập nhật được.'); }
}
// MỚI: đánh dấu đã thu phí ship gộp - server tự đồng bộ cho mọi đơn khác cùng nhóm
async function updateMergeShippingPaid(id, mergeShippingPaid){
  const res = await apiFetch(`/api/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ mergeShippingPaid }) });
  if(res.ok){ await tryLoadOrders(); } else { alert('Không cập nhật được.'); }
}
async function updateTracking(id){
  const input = document.getElementById(`tracking-${id}`);
  const trackingCode = input.value.trim();
  const res = await apiFetch(`/api/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ trackingCode }) });
  if(res.ok){ await tryLoadOrders(); } else { alert('Không lưu được mã vận đơn.'); }
}

// ---------- Sản phẩm ----------
async function loadProducts(){
  const res = await fetch('/api/products');
  products = await res.json();
  if(!categoriesLoaded){ await loadCategories(); }
  renderProducts();
}

// MỚI: tải danh sách danh mục (dùng chung public - không cần đăng nhập để đọc)
async function loadCategories(){
  const res = await fetch('/api/categories');
  if(res.ok){ categories = await res.json(); categoriesLoaded = true; }
}

function renderProducts(){
  const wrap = document.getElementById('productsTab');
  wrap.innerHTML = `
    <!-- MỚI: quản lý danh mục -->
    <div class="add-product-form">
      <h3>🗂️ Quản lý danh mục</h3>
      <div id="categoryManageList">${renderCategoryManageRows()}</div>
      <div class="form-row" style="margin-top:10px;">
        <div class="form-field"><input id="new-cat-label" placeholder="Tên danh mục mới, VD: Đồ chơi Noel"></div>
        <button onclick="addCategory()">+ Thêm danh mục</button>
      </div>
      <p id="categoryMsg" style="font-size:13px; margin-top:8px; color:#B23A3A;"></p>
      <button onclick="autoCategorizeProducts()" style="margin-top:10px; background:var(--sage-deep); color:#fff; border:none; padding:8px 14px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer;">🪄 Tự động phân loại lại sản phẩm trong "Phụ kiện khác" theo tên</button>
      <p id="autoCatMsg" style="font-size:13px; margin-top:8px; color:var(--sage-deep);"></p>
    </div>

    <!-- MỚI: nhập/cập nhật hàng loạt sản phẩm từ Shopee -->
    <div class="add-product-form">
      <h3>📦 Nhập sản phẩm hàng loạt từ Shopee</h3>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:10px;">Chọn cả 3 file Shopee xuất ra (basic_info, sales_info, media_info). Sản phẩm đã có (trùng Mã Sản phẩm) sẽ được cập nhật tên/giá/kho/ảnh/mô tả, không đổi danh mục đã gán. Sản phẩm mới sẽ tạm xếp vào "Phụ kiện khác".</p>
      <div class="form-field"><label>File basic_info (.xlsx)</label><input type="file" id="shopee-basic-file" accept=".xlsx,.xls"></div>
      <div class="form-field"><label>File sales_info (.xlsx) — bắt buộc</label><input type="file" id="shopee-sales-file" accept=".xlsx,.xls"></div>
      <div class="form-field"><label>File media_info (.xlsx)</label><input type="file" id="shopee-media-file" accept=".xlsx,.xls"></div>
      <button onclick="importShopeeProducts()">Nhập sản phẩm</button>
      <p id="shopeeImportMsg" style="font-size:13px; margin-top:8px; color:var(--sage-deep);"></p>
    </div>

    <div class="add-product-form">
      <h3>Thêm sản phẩm mới</h3>
      <div class="form-row">
        <div class="form-field"><label>Tên</label><input id="np-name" placeholder="Móc khóa mèo mini"></div>
        <div class="form-field">
          <label>Danh mục</label>
          <select id="np-cat">
            <option value="">-- Chưa chọn (tự xếp vào "Phụ kiện khác") --</option>
            ${categories.map(c => `<option value="${c.key}">${escapeHtml(c.label)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Link ảnh đại diện sản phẩm</label><input id="np-image" placeholder="https://..."></div>
        <div class="form-field">
          <label>Hoặc tải ảnh từ máy lên</label>
          <input type="file" accept="image/*" onchange="uploadToTarget(this, 'np-image')">
        </div>
      </div>
      <div class="form-field">
        <label>Mô tả sản phẩm</label>
        <textarea id="np-desc" rows="3" placeholder="Mô tả ngắn về sản phẩm..."></textarea>
      </div>

      <h4 style="margin:16px 0 8px;">Phân loại (SKU)</h4>
      <div style="background:#FAFAFC; border:1px dashed var(--line); border-radius:10px; padding:10px 12px; margin-bottom:10px;">
        <p style="font-size:12px; color:var(--ink-soft); margin:0 0 8px;">Áp dụng cho tất cả phân loại bên dưới — để trống ô nào thì giữ nguyên giá trị riêng</p>
        <div class="form-row">
          <div class="form-field"><input id="np-bulk-stock" type="number" placeholder="Số lượng"></div>
          <div class="form-field"><input id="np-bulk-price" type="number" placeholder="Giá (đ)"></div>
          <div class="form-field"><input id="np-bulk-weight" type="number" placeholder="Cân nặng (g)"></div>
          <button onclick="applyBulkToNewProductSkus()">Áp dụng cho tất cả</button>
        </div>
      </div>
      <div id="newProductSkuList"></div>
      <button onclick="addNewProductSku()" style="margin-top:6px;">+ Thêm phân loại</button>

      <h4 style="margin:16px 0 8px;">Ảnh mô tả thêm (hiện trong phần mô tả sản phẩm)</h4>
      <div id="newProductImageList" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
      <button onclick="addNewProductImage()" style="margin-top:8px;">+ Thêm ảnh</button>

      <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin:16px 0;">
        <input type="checkbox" id="np-hidden"> Ẩn sản phẩm này trên trang chủ (chưa muốn bán ngay)
      </label>
      <button onclick="addProduct()" style="background:var(--sage-deep); color:#fff; border:none; padding:10px 18px; border-radius:10px; font-weight:600; cursor:pointer;">Thêm sản phẩm</button>
      <p id="addProductMsg" style="font-size:13px; margin-top:8px; color:#B23A3A;"></p>
    </div>
    <div class="form-row" style="margin-bottom:14px;">
      <div class="form-field">
        <input id="productSearchInput" placeholder="Tìm sản phẩm theo tên..." value="${escapeHtml(productSearch)}" oninput="productSearch=this.value; productPage=1; renderProductList();">
      </div>
      <div class="form-field">
        <select onchange="productCategoryFilter=this.value; productPage=1; renderProductList();">
          <option value="all" ${productCategoryFilter==='all'?'selected':''}>Tất cả danh mục</option>
          ${categories.map(c => `<option value="${c.key}" ${productCategoryFilter===c.key?'selected':''}>${escapeHtml(c.label)}</option>`).join('')}
        </select>
      </div>
      <!-- MỚI: lọc theo trạng thái hiển thị / tồn kho -->
      <div class="form-field">
        <select onchange="productStatusFilter=this.value; productPage=1; renderProductList();">
          <option value="all" ${productStatusFilter==='all'?'selected':''}>Tất cả trạng thái</option>
          <option value="visible" ${productStatusFilter==='visible'?'selected':''}>Đang hiển thị trên trang chủ</option>
          <option value="hidden" ${productStatusFilter==='hidden'?'selected':''}>Đang ẩn trên trang chủ</option>
          <option value="instock" ${productStatusFilter==='instock'?'selected':''}>Còn hàng</option>
          <option value="outofstock" ${productStatusFilter==='outofstock'?'selected':''}>Hết hàng</option>
        </select>
      </div>
    </div>
    <div style="margin-bottom:14px;">
      <button onclick="hideOutOfStockProducts()">🙈 Ẩn hết các sản phẩm đang hết hàng khỏi trang chủ</button>
      <p id="hideOutOfStockMsg" style="font-size:13px; margin-top:6px; color:var(--sage-deep);"></p>
    </div>
    <div id="productList"></div>
  `;
  newProductSkus = [{ id: 1, name: '', image: '', stock: '', price: '', weight: '' }];
  newProductNextSkuId = 2;
  newProductImages = [];
  newProductNextImageId = 1;
  renderNewProductSkus();
  renderNewProductImages();
  renderProductList();
}

// ---------- MỚI: form "Thêm sản phẩm mới" - nhiều phân loại (SKU) + nhiều ảnh mô tả ----------
let newProductSkus = [];
let newProductNextSkuId = 1;
let newProductImages = [];
let newProductNextImageId = 1;

function renderNewProductSkus(){
  const wrap = document.getElementById('newProductSkuList');
  if(!wrap) return;
  wrap.innerHTML = newProductSkus.map((s, idx) => `
    <div style="background:#FAFAFC; border:1px solid var(--line); border-radius:10px; padding:10px 12px; margin-bottom:8px;" data-sku-id="${s.id}">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
        <span style="font-size:12px; color:var(--ink-soft);">Phân loại ${idx + 1}</span>
        ${newProductSkus.length > 1 ? `<button onclick="removeNewProductSku(${s.id})" style="font-size:11px; padding:3px 8px;">Xoá</button>` : ''}
      </div>
      <div class="form-row">
        <div class="form-field"><input class="sku-name" placeholder="Tên phân loại (VD: Màu đỏ)" value="${escapeHtml(s.name)}" oninput="newProductSkus.find(x=>x.id===${s.id}).name=this.value"></div>
        <div class="form-field"><input class="sku-image" placeholder="Link ảnh phân loại" value="${escapeHtml(s.image)}" oninput="newProductSkus.find(x=>x.id===${s.id}).image=this.value"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><input class="sku-stock" type="number" placeholder="Số lượng" value="${s.stock}" oninput="newProductSkus.find(x=>x.id===${s.id}).stock=this.value"></div>
        <div class="form-field"><input class="sku-price" type="number" placeholder="Giá (đ)" value="${s.price}" oninput="newProductSkus.find(x=>x.id===${s.id}).price=this.value"></div>
        <div class="form-field"><input class="sku-weight" type="number" placeholder="Cân nặng (g)" value="${s.weight}" oninput="newProductSkus.find(x=>x.id===${s.id}).weight=this.value"></div>
        <div class="form-field"><input type="file" accept="image/*" onchange="uploadToNewProductSku(this, ${s.id})"></div>
      </div>
    </div>
  `).join('');
}
function addNewProductSku(){
  newProductSkus.push({ id: newProductNextSkuId++, name: '', image: '', stock: '', price: '', weight: '' });
  renderNewProductSkus();
}
function removeNewProductSku(id){
  newProductSkus = newProductSkus.filter(s => s.id !== id);
  renderNewProductSkus();
}
function applyBulkToNewProductSkus(){
  const stock = document.getElementById('np-bulk-stock').value;
  const price = document.getElementById('np-bulk-price').value;
  const weight = document.getElementById('np-bulk-weight').value;
  newProductSkus.forEach(s => {
    if(stock !== '') s.stock = stock;
    if(price !== '') s.price = price;
    if(weight !== '') s.weight = weight;
  });
  renderNewProductSkus();
}
async function uploadToNewProductSku(fileInput, id){
  const file = fileInput.files[0];
  if(!file) return;
  const formData = new FormData();
  formData.append('image', file);
  try{
    const res = await fetch('/api/upload-image', { method: 'POST', headers: { 'x-admin-key': adminKey }, body: formData });
    if(!res.ok) return;
    const data = await res.json();
    newProductSkus.find(s => s.id === id).image = data.url;
    renderNewProductSkus();
  } catch(e){ /* im lặng bỏ qua, admin có thể dán link thủ công */ }
}

function renderNewProductImages(){
  const wrap = document.getElementById('newProductImageList');
  if(!wrap) return;
  wrap.innerHTML = newProductImages.map((img, idx) => `
    <div style="width:160px; background:#FAFAFC; border:1px solid var(--line); border-radius:10px; padding:8px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
        <span style="font-size:11px; color:var(--ink-soft);">Ảnh ${idx + 1}</span>
        <button onclick="removeNewProductImage(${img.id})" style="font-size:11px; padding:2px 6px;">Xoá</button>
      </div>
      <input placeholder="Link ảnh" value="${escapeHtml(img.url)}" style="width:100%; font-size:12px; margin-bottom:6px;" oninput="newProductImages.find(x=>x.id===${img.id}).url=this.value">
      <input type="file" accept="image/*" style="width:100%; font-size:11px;" onchange="uploadToNewProductImage(this, ${img.id})">
    </div>
  `).join('') || '<p style="font-size:12px; color:var(--ink-soft);">Chưa có ảnh mô tả nào.</p>';
}
function addNewProductImage(){
  newProductImages.push({ id: newProductNextImageId++, url: '' });
  renderNewProductImages();
}
function removeNewProductImage(id){
  newProductImages = newProductImages.filter(i => i.id !== id);
  renderNewProductImages();
}
async function uploadToNewProductImage(fileInput, id){
  const file = fileInput.files[0];
  if(!file) return;
  const formData = new FormData();
  formData.append('image', file);
  try{
    const res = await fetch('/api/upload-image', { method: 'POST', headers: { 'x-admin-key': adminKey }, body: formData });
    if(!res.ok) return;
    const data = await res.json();
    newProductImages.find(i => i.id === id).url = data.url;
    renderNewProductImages();
  } catch(e){ /* im lặng bỏ qua, admin có thể dán link thủ công */ }
}

// Dùng chung cho "Link ảnh đại diện sản phẩm": tải ảnh lên rồi điền thẳng vào ô input đích
async function uploadToTarget(fileInput, targetInputId){
  const file = fileInput.files[0];
  if(!file) return;
  const formData = new FormData();
  formData.append('image', file);
  try{
    const res = await fetch('/api/upload-image', { method: 'POST', headers: { 'x-admin-key': adminKey }, body: formData });
    if(!res.ok) return;
    const data = await res.json();
    document.getElementById(targetInputId).value = data.url;
  } catch(e){ /* im lặng bỏ qua, admin có thể dán link thủ công */ }
}

// MỚI: danh sách danh mục hiện có + số sản phẩm mỗi danh mục + nút xoá
function renderCategoryManageRows(){
  return categories.map((c, i) => {
    const count = products.filter(p => p.category === c.key).length;
    const isOpen = expandedCategoryKey === c.key;
    return `
      <div style="padding:8px 0; border-bottom:1px dashed var(--line);">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="display:flex; flex-direction:column; gap:2px;">
            <button onclick="moveCategory('${c.key}','up')" ${i===0 ? 'disabled' : ''} title="Lên" style="padding:2px 6px; line-height:1;">▲</button>
            <button onclick="moveCategory('${c.key}','down')" ${i===categories.length-1 ? 'disabled' : ''} title="Xuống" style="padding:2px 6px; line-height:1;">▼</button>
          </div>
          <input type="text" value="${escapeHtml(c.label)}" style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid var(--line); font-size:13px;" onchange="renameCategory('${c.key}', this.value)">
          <span style="font-size:12px; color:var(--ink-soft); white-space:nowrap;">${count} sản phẩm</span>
          <button onclick="toggleCategoryProducts('${c.key}')">${isOpen ? 'Đóng' : 'Quản lý sản phẩm'}</button>
          <button class="danger" onclick="deleteCategory('${c.key}')">Xoá</button>
        </div>
        ${isOpen ? renderCategoryProductPanel(c) : ''}
      </div>
    `;
  }).join('');
}

// MỚI: đổi thứ tự hiển thị danh mục (áp dụng luôn cho "Bộ sưu tập nổi bật" và sidebar
// danh mục ở trang chủ, vì cả 2 đều tự lấy theo đúng thứ tự danh mục đang lưu ở đây)
async function moveCategory(key, direction){
  const idx = categories.findIndex(c => c.key === key);
  if(idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if(swapIdx < 0 || swapIdx >= categories.length) return;
  const backup = categories.slice();
  [categories[idx], categories[swapIdx]] = [categories[swapIdx], categories[idx]];
  const ok = await saveCategoriesToServer();
  if(ok){ renderProducts(); showAdminToast('✓ Đã đổi vị trí danh mục'); } else { categories = backup; renderProducts(); }
}

// MỚI: mở/đóng khu quản lý sản phẩm bên trong 1 danh mục
function toggleCategoryProducts(key){
  expandedCategoryKey = expandedCategoryKey === key ? null : key;
  categoryProductSearch = '';
  categoryProductViewFilter = 'all';
  categoryProductPage = 1;
  selectedCategoryProductIds = new Set();
  document.getElementById('categoryManageList').innerHTML = renderCategoryManageRows();
}

const CATEGORY_PRODUCTS_PER_PAGE = 20; // MỚI

// MỚI: danh sách sản phẩm trong 1 danh mục, tick chọn + chuyển hàng loạt sang danh mục khác
// (tick chọn sản phẩm rồi "chuyển tới" = vừa thêm vào danh mục đích, vừa tự động bớt khỏi danh mục này)
function renderCategoryProductPanel(c){
  const q = categoryProductSearch.trim().toLowerCase();
  // MỚI: lọc theo tên tìm kiếm + theo danh mục đang chọn trong dropdown (categoryProductViewFilter
  // là 'all' hoặc key của 1 danh mục bất kỳ, không nhất thiết phải là danh mục đang mở)
  const allMatching = products.filter(p =>
    (!q || p.name.toLowerCase().includes(q)) &&
    (categoryProductViewFilter === 'all' || p.category === categoryProductViewFilter)
  );

  // MỚI: hiện toàn bộ sản phẩm khớp, không phân trang 20 sản phẩm/lần nữa
  const shown = allMatching;
  const rows = shown.map((p, i) => {
    // MỚI: đổi vị trí với sản phẩm liền kề TRONG ĐÚNG DANH SÁCH ĐANG XEM ở đây (dùng lại
    // chung API move-swap với mũi tên ở danh sách sản phẩm chính, nên vị trí đổi ở đây
    // cũng phản ánh đúng qua bên đó, kể cả ngoài trang chủ)
    const prevNeighbor = i > 0 ? shown[i - 1] : null;
    const nextNeighbor = i < shown.length - 1 ? shown[i + 1] : null;
    return `
    <label style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px dashed var(--line); font-size:13px;">
      <input type="checkbox" class="cat-product-checkbox" data-id="${escapeHtml(p.id)}" ${selectedCategoryProductIds.has(p.id) ? 'checked' : ''}>
      <div style="display:flex; flex-direction:column; gap:1px;">
        <button onclick="event.preventDefault(); event.stopPropagation(); moveProduct('${p.id}', '${prevNeighbor ? prevNeighbor.id : ''}')" ${!prevNeighbor ? 'disabled' : ''} title="Lên" style="padding:1px 5px; line-height:1;">▲</button>
        <button onclick="event.preventDefault(); event.stopPropagation(); moveProduct('${p.id}', '${nextNeighbor ? nextNeighbor.id : ''}')" ${!nextNeighbor ? 'disabled' : ''} title="Xuống" style="padding:1px 5px; line-height:1;">▼</button>
      </div>
      ${p.image ? `<img src="${escapeHtml(p.image)}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;">` : `<span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">🎁</span>`}
      <span style="flex:1;">${escapeHtml(p.name)}</span>
      <span style="font-size:11px; color:${p.category===c.key ? 'var(--sage-deep)' : 'var(--ink-soft)'}; white-space:nowrap;">${p.category===c.key ? '✓ đang ở đây' : escapeHtml(catLabel(p.category))}</span>
    </label>
  `;
  }).join('');

  const pagerHtml = '';

  // MỚI: dropdown chọn danh mục đích bên dưới cho phép gán bất kỳ danh mục nào, không chỉ
  // danh mục đang mở, nên không cần nút "Đưa ra khỏi danh mục" riêng nữa

  return `
    <div style="background:#FAFAFC; border:1px solid var(--line); border-radius:10px; padding:12px; margin-top:10px;" data-category-panel="${escapeHtml(c.key)}">
      <input id="cat-product-search-${c.key}" placeholder="Tìm sản phẩm (trong tất cả danh mục)..." value="${escapeHtml(categoryProductSearch)}"
        style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--line); font-size:13px; margin-bottom:10px;"
        oninput="updateCategoryProductSearch(this.value, '${c.key}')">
      <div style="margin-bottom:10px;">
        <label style="font-size:12px; color:var(--ink-soft); display:block; margin-bottom:4px;">Lọc theo danh mục</label>
        <select onchange="setCategoryProductViewFilter(this.value)" style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--line); font-size:13px;">
          <option value="all" ${categoryProductViewFilter==='all' ? 'selected' : ''}>Tất cả danh mục (${products.filter(p => !q || p.name.toLowerCase().includes(q)).length} sản phẩm)</option>
          ${categories.map(cat => `<option value="${cat.key}" ${categoryProductViewFilter===cat.key ? 'selected' : ''}>${escapeHtml(cat.label)}${cat.key===c.key ? ' — danh mục này' : ''} (${products.filter(p => p.category===cat.key && (!q || p.name.toLowerCase().includes(q))).length} sản phẩm)</option>`).join('')}
        </select>
      </div>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:6px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span>${allMatching.length} sản phẩm khớp${categoryProductViewFilter!=='all' ? ` (đang trong "${escapeHtml(catLabel(categoryProductViewFilter))}")` : ' (tất cả danh mục)'} · Đã chọn: ${selectedCategoryProductIds.size}</span>
        ${selectedCategoryProductIds.size > 0 ? `<button onclick="clearCategoryProductSelection()" style="font-size:11px; padding:4px 10px;">Bỏ chọn tất cả</button>` : ''}
      </p>
      <label style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--line); margin-bottom:4px; font-size:13px; font-weight:600;">
        <input type="checkbox" class="cat-select-all" data-key="${escapeHtml(c.key)}" ${allMatching.length > 0 && allMatching.every(p => selectedCategoryProductIds.has(p.id)) ? 'checked' : ''}>
        Chọn tất cả ${allMatching.length} sản phẩm khớp
      </label>
      <div style="margin-bottom:10px;">${rows || '<p style="font-size:13px; color:var(--ink-soft);">Không có sản phẩm nào.</p>'}</div>
      ${pagerHtml}
      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <select id="move-target-cat-${c.key}" style="padding:8px 10px; border-radius:8px; border:1px solid var(--line); font-size:13px;">
          ${categories.map(cat => `<option value="${cat.key}" ${cat.key===c.key ? 'selected' : ''}>${escapeHtml(cat.label)}${cat.key===c.key ? ' (danh mục này)' : ''}</option>`).join('')}
        </select>
        <button onclick="moveSelectedProductsToCategory(document.getElementById('move-target-cat-${c.key}').value, '${c.key}')">Đặt danh mục đã chọn ở trên cho sản phẩm đã tick</button>
      </div>
      <p id="move-cat-msg-${c.key}" style="font-size:12px; margin-top:6px; color:var(--sage-deep);"></p>
    </div>
  `;
}

// MỚI: đổi danh mục đang dùng để lọc danh sách (áp dụng cho mọi danh mục, không chỉ danh mục đang mở)
function setCategoryProductViewFilter(value){
  categoryProductViewFilter = value;
  categoryProductPage = 1;
  document.getElementById('categoryManageList').innerHTML = renderCategoryManageRows();
}

// MỚI: xử lý tick/bỏ tick bằng event delegation (1 listener gắn sẵn trên toàn trang,
// không phụ thuộc vào onchange="..." nhúng trực tiếp id/tên sản phẩm vào HTML) — đây
// là điểm mấu chốt sửa lỗi "bấm bỏ tick không có phản ứng gì" khi tên sản phẩm hoặc
// dữ liệu khác chứa ký tự đặc biệt làm hỏng markup của toàn khối.
document.addEventListener('change', (e) => {
  const t = e.target;
  if(t.matches && t.matches('.cat-product-checkbox')){
    toggleSelectCategoryProduct(t.dataset.id, t.checked);
  } else if(t.matches && t.matches('.cat-select-all')){
    toggleSelectAllCategoryProducts(t.dataset.key, t.checked);
  }
});

// MỚI: gõ tìm kiếm trong khu quản lý sản phẩm theo danh mục - vẽ lại danh sách
// nhưng tự trả lại tiêu điểm (focus) cho ô nhập, tránh bị mất focus sau mỗi ký tự
function updateCategoryProductSearch(value, key){
  categoryProductSearch = value;
  categoryProductPage = 1;
  document.getElementById('categoryManageList').innerHTML = renderCategoryManageRows();
  const input = document.getElementById(`cat-product-search-${key}`);
  if(input){
    input.focus();
    const len = input.value.length;
    input.setSelectionRange(len, len);
  }
}

// MỚI: chọn/bỏ chọn tất cả sản phẩm đang khớp tìm kiếm + bộ lọc hiện tại (không chỉ trang đang xem)
function toggleSelectAllCategoryProducts(key, checked){
  const q = categoryProductSearch.trim().toLowerCase();
  const allMatching = products.filter(p =>
    (!q || p.name.toLowerCase().includes(q)) &&
    (categoryProductViewFilter === 'all' || p.category === categoryProductViewFilter)
  );
  if(checked){ allMatching.forEach(p => selectedCategoryProductIds.add(p.id)); }
  else { allMatching.forEach(p => selectedCategoryProductIds.delete(p.id)); }
  document.getElementById('categoryManageList').innerHTML = renderCategoryManageRows();
}

function toggleSelectCategoryProduct(id, checked){
  if(checked) selectedCategoryProductIds.add(id); else selectedCategoryProductIds.delete(id);
  document.getElementById('categoryManageList').innerHTML = renderCategoryManageRows();
}

// MỚI: bỏ chọn TOÀN BỘ sản phẩm đã tick, bất kể đang lọc tìm kiếm gì
function clearCategoryProductSelection(){
  selectedCategoryProductIds = new Set();
  document.getElementById('categoryManageList').innerHTML = renderCategoryManageRows();
}

// MỚI: chuyển hàng loạt các sản phẩm đã tick sang 1 danh mục khác.
// targetKey = danh mục sẽ gán cho sản phẩm; msgKey = danh mục ĐANG MỞ trên màn hình (dùng
// để tìm đúng dòng thông báo kết quả) — 2 giá trị này khác nhau khi dùng nút "Đưa ra khỏi
// danh mục này" (targetKey luôn là 'khac', nhưng thông báo phải hiện trong panel đang mở).
async function moveSelectedProductsToCategory(targetKey, msgKey){
  msgKey = msgKey || targetKey;
  if(selectedCategoryProductIds.size === 0){
    alert('Chưa chọn sản phẩm nào.');
    return;
  }
  const msgEl = document.getElementById(`move-cat-msg-${msgKey}`);
  if(msgEl) msgEl.textContent = 'Đang cập nhật...';
  const res = await apiFetch('/api/admin/products/bulk-set-category', {
    method: 'POST',
    body: JSON.stringify({ ids: Array.from(selectedCategoryProductIds), category: targetKey })
  });
  if(res.ok){
    selectedCategoryProductIds = new Set();
    await loadProducts();
    // Giữ nguyên danh mục đang mở để thấy kết quả ngay (không nhảy sang danh mục đích)
    expandedCategoryKey = msgKey;
    renderProducts();
  } else {
    if(msgEl){
      msgEl.style.color = '#B23A3A';
      msgEl.textContent = 'Cập nhật thất bại, thử lại.';
    }
  }
}

// MỚI: tạo key kỹ thuật (không dấu) từ tên danh mục tiếng Việt admin gõ vào
function slugifyCategory(label){
  const noDiacritics = label
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const key = noDiacritics.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
  return key || 'danhmuc' + Date.now();
}

async function saveCategoriesToServer(){
  const res = await apiFetch('/api/admin/categories', {
    method: 'POST',
    body: JSON.stringify(categories)
  });
  const msgEl = document.getElementById('categoryMsg');
  if(res.ok){
    if(msgEl) msgEl.textContent = '';
    return true;
  } else {
    const data = await res.json().catch(() => ({}));
    if(msgEl) msgEl.textContent = data.error || 'Không lưu được danh mục.';
    return false;
  }
}

async function addCategory(){
  const input = document.getElementById('new-cat-label');
  const label = input.value.trim();
  if(!label) return;
  let key = slugifyCategory(label);
  // Tránh trùng key nếu lỡ đặt tên gần giống danh mục đã có
  while(categories.some(c => c.key === key)){ key += '2'; }
  const backup = categories.slice();
  categories.push({ key, label });
  const ok = await saveCategoriesToServer();
  if(ok){ input.value = ''; renderProducts(); } else { categories = backup; renderProducts(); }
}

async function renameCategory(key, newLabel){
  const backup = categories.slice();
  const c = categories.find(c => c.key === key);
  if(!c) return;
  c.label = newLabel.trim() || c.label;
  const ok = await saveCategoriesToServer();
  if(!ok){ categories = backup; renderProducts(); }
}

async function deleteCategory(key){
  const c = categories.find(c => c.key === key);
  const count = products.filter(p => p.category === key).length;
  if(count > 0){
    alert(`Không thể xoá "${c.label}" vì còn ${count} sản phẩm thuộc danh mục này. Hãy đổi danh mục cho các sản phẩm đó trước (trong mục "Sửa giá/kho/ảnh" của từng sản phẩm).`);
    return;
  }
  if(!confirm(`Xoá danh mục "${c.label}"?`)) return;
  const backup = categories.slice();
  categories = categories.filter(c => c.key !== key);
  const ok = await saveCategoriesToServer();
  if(ok){ renderProducts(); } else { categories = backup; renderProducts(); }
}

// MỚI: tự động đoán danh mục theo tên sản phẩm cho các sản phẩm đang ở "Phụ kiện khác"
async function autoCategorizeProducts(){
  const msgEl = document.getElementById('autoCatMsg');
  msgEl.textContent = 'Đang phân loại...';
  const res = await apiFetch('/api/admin/products/auto-categorize', { method: 'POST' });
  if(res.ok){
    const data = await res.json();
    msgEl.textContent = `Đã tự động chuyển ${data.changed} sản phẩm sang đúng danh mục theo tên. Kiểm tra lại và sửa tay các trường hợp còn sai nhé.`;
    await loadProducts();
  } else {
    msgEl.style.color = '#B23A3A';
    msgEl.textContent = 'Lỗi khi phân loại, thử lại.';
  }
}

// MỚI: nhập hàng loạt sản phẩm từ 3 file Excel Shopee
async function importShopeeProducts(){
  const basicFile = document.getElementById('shopee-basic-file').files[0];
  const salesFile = document.getElementById('shopee-sales-file').files[0];
  const mediaFile = document.getElementById('shopee-media-file').files[0];
  const msgEl = document.getElementById('shopeeImportMsg');

  if(!salesFile){
    msgEl.style.color = '#B23A3A';
    msgEl.textContent = 'Cần chọn ít nhất file sales_info (chứa giá/kho).';
    return;
  }

  msgEl.style.color = 'var(--ink-soft)';
  msgEl.textContent = 'Đang đọc file...';

  try{
    msgEl.textContent = 'Đang đọc file basic_info...';
    const basicRows = basicFile ? await parseShopeeExcel(basicFile, parseShopeeBasicRow) : [];
    msgEl.textContent = 'Đang đọc file sales_info...';
    const salesRows = await parseShopeeExcel(salesFile, parseShopeeSalesRow);
    msgEl.textContent = 'Đang đọc file media_info...';
    const mediaRows = mediaFile ? await parseShopeeExcel(mediaFile, parseShopeeMediaRow) : [];

    msgEl.textContent = `Đọc xong (basic: ${basicRows.length}, sales: ${salesRows.length}, media: ${mediaRows.length} dòng). Đang lưu vào hệ thống...`;
    const res = await apiFetch('/api/admin/products/bulk-import', {
      method: 'POST',
      body: JSON.stringify({ basic: basicRows, sales: salesRows, media: mediaRows })
    });
    const data = await res.json();
    if(res.ok){
      msgEl.style.color = 'var(--sage-deep)';
      msgEl.textContent = `Xong! Đã thêm mới ${data.created} sản phẩm, cập nhật ${data.updated} sản phẩm.`;
      await loadProducts();
    } else {
      msgEl.style.color = '#B23A3A';
      msgEl.textContent = data.error || 'Nhập sản phẩm thất bại.';
    }
  } catch(e){
    msgEl.style.color = '#B23A3A';
    msgEl.textContent = 'Lỗi: ' + (e && e.message ? e.message : String(e));
    console.error('Lỗi nhập Shopee:', e);
  }
}

// MỚI: đọc 1 file Excel Shopee, bỏ qua các dòng tiêu đề/hướng dẫn ở đầu (dữ liệu thật
// bắt đầu từ dòng có Mã Sản phẩm là số), áp hàm parseRow cho từng dòng dữ liệu
function parseShopeeExcel(file, parseRow){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try{
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
        const results = [];
        for(const row of rows){
          const id = row[0];
          if(id === null || id === undefined || id === '') continue;
          if(!/^\d+$/.test(String(id).trim())) continue; // bỏ qua dòng tiêu đề/hướng dẫn không phải mã số
          const parsed = parseRow(row);
          if(parsed) results.push(parsed);
        }
        resolve(results);
      } catch(err){ reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
// Cột: [Mã Sản phẩm, SKU Sản phẩm, Tên Sản phẩm, Mô tả Sản phẩm, Lý do thất bại]
function parseShopeeBasicRow(row){
  return { id: String(row[0]).trim(), name: row[2] || '', description: row[3] || '' };
}
// Cột: [Mã Sản phẩm, Tên Sản phẩm, Mã Phân loại, Tên phân loại, SKU Sản phẩm, SKU, Giá, GTIN, Số lượng, Lý do thất bại]
function parseShopeeSalesRow(row){
  return {
    id: String(row[0]).trim(),
    name: row[1] || '',
    variationName: row[3] || null,
    price: Number(row[6]) || 0,
    stock: Number(row[8]) || 0
  };
}
// Cột: [Mã Sản phẩm, SKU Sản phẩm, Tên Sản phẩm, Ngành hàng, Ảnh bìa, Hình ảnh 1..8, ...]
function parseShopeeMediaRow(row){
  const images = [];
  for(let i = 5; i <= 12; i++){ if(row[i]) images.push(row[i]); }
  return { id: String(row[0]).trim(), name: row[2] || '', cover: row[4] || '', images };
}

// MỚI: ẩn hàng loạt tất cả sản phẩm đang hết hàng
async function hideOutOfStockProducts(){
  if(!confirm('Ẩn khỏi trang chủ tất cả sản phẩm đang hết hàng (Tổng tồn = 0)?')) return;
  const msgEl = document.getElementById('hideOutOfStockMsg');
  msgEl.textContent = 'Đang xử lý...';
  const res = await apiFetch('/api/admin/products/hide-out-of-stock', { method: 'POST' });
  if(res.ok){
    const data = await res.json();
    msgEl.textContent = `Đã ẩn ${data.changed} sản phẩm hết hàng.`;
    await loadProducts();
  } else {
    msgEl.style.color = '#B23A3A';
    msgEl.textContent = 'Lỗi khi ẩn, thử lại.';
  }
}

// ---------- MỚI: chọn tất cả/bỏ chọn/từng sản phẩm + sửa/ẩn/xoá hàng loạt ----------
function toggleSelectProduct(id, checked){
  if(checked) selectedProductIds.add(id); else selectedProductIds.delete(id);
  renderProductList();
}
function toggleSelectAllProducts(checked){
  const q = productSearch.trim().toLowerCase();
  const list = products.filter(p =>
    (!q || p.name.toLowerCase().includes(q)) &&
    (productCategoryFilter === 'all' || p.category === productCategoryFilter) &&
    (productStatusFilter === 'all'
      || (productStatusFilter === 'visible' && !p.hidden)
      || (productStatusFilter === 'hidden' && p.hidden)
      || (productStatusFilter === 'instock' && p.totalStock > 0)
      || (productStatusFilter === 'outofstock' && p.totalStock <= 0))
  );
  if(checked){ list.forEach(p => selectedProductIds.add(p.id)); }
  else { list.forEach(p => selectedProductIds.delete(p.id)); }
  renderProductList();
}
function clearSelectedProducts(){
  selectedProductIds = new Set();
  renderProductList();
}

function renderBulkEditPanel(){
  return `
    <div style="background:#FAFAFC; border:1px dashed var(--line); border-radius:10px; padding:12px; margin-bottom:10px;">
      <p style="font-size:12px; color:var(--ink-soft); margin:0 0 8px;">Áp dụng cho toàn bộ phân loại (SKU) của các sản phẩm đã chọn — để trống ô nào thì giữ nguyên giá trị hiện tại</p>
      <div class="form-row">
        <div class="form-field"><input id="bulkEditStock" type="number" placeholder="Số lượng"></div>
        <div class="form-field"><input id="bulkEditWeight" type="number" placeholder="Cân nặng (g)"></div>
        <div class="form-field">
          <select id="bulkEditPriceMode" onchange="bulkEditPriceMode=this.value">
            <option value="set" ${bulkEditPriceMode==='set'?'selected':''}>Đặt giá cố định</option>
            <option value="pct" ${bulkEditPriceMode==='pct'?'selected':''}>Tăng/giảm theo %</option>
          </select>
        </div>
        <div class="form-field"><input id="bulkEditPriceValue" type="number" placeholder="VD: 45000 hoặc -10"></div>
      </div>
      <button onclick="applyBulkEditProducts()" style="background:var(--sage-deep); color:#fff; border:none; padding:8px 16px; border-radius:8px; font-weight:600; cursor:pointer;">Áp dụng cho các sản phẩm đã chọn</button>
      <p id="bulkEditMsg" style="font-size:13px; margin-top:8px; color:var(--sage-deep);"></p>
    </div>
  `;
}

async function applyBulkEditProducts(){
  const stock = document.getElementById('bulkEditStock').value;
  const weight = document.getElementById('bulkEditWeight').value;
  const priceValue = document.getElementById('bulkEditPriceValue').value;
  const msgEl = document.getElementById('bulkEditMsg');
  msgEl.textContent = 'Đang cập nhật...';
  const res = await apiFetch('/api/admin/products/bulk-edit', {
    method: 'POST',
    body: JSON.stringify({
      ids: Array.from(selectedProductIds),
      stock: stock === '' ? undefined : stock,
      weight: weight === '' ? undefined : weight,
      priceMode: bulkEditPriceMode,
      priceValue: priceValue === '' ? undefined : priceValue,
    })
  });
  if(res.ok){
    await loadProducts();
  } else {
    msgEl.textContent = 'Không sửa hàng loạt được, thử lại.';
  }
}

async function bulkHideProducts(){
  if(!confirm(`Ẩn ${selectedProductIds.size} sản phẩm đã chọn trên trang chủ?`)) return;
  const res = await apiFetch('/api/admin/products/bulk-hide', { method: 'POST', body: JSON.stringify({ ids: Array.from(selectedProductIds) }) });
  if(res.ok){ selectedProductIds = new Set(); await loadProducts(); }
}

async function bulkDeleteProducts(){
  if(!confirm(`Xoá hẳn ${selectedProductIds.size} sản phẩm đã chọn? Không thể hoàn tác.`)) return;
  const res = await apiFetch('/api/admin/products/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: Array.from(selectedProductIds) }) });
  if(res.ok){ selectedProductIds = new Set(); await loadProducts(); }
}

// MỚI: ghim/bỏ ghim sản phẩm lên đầu danh sách hiển thị
async function pinProduct(id){
  const res = await apiFetch(`/api/admin/products/${id}/pin`, { method: 'POST' });
  if(res.ok){ await loadProducts(); } else { alert('Không ghim được sản phẩm.'); }
}

// MỚI: đổi vị trí hiển thị với sản phẩm liền kề (withId tính sẵn từ trang đang xem)
async function moveProduct(id, withId){
  if(!withId) return;
  const res = await apiFetch(`/api/admin/products/${id}/move-swap`, { method: 'POST', body: JSON.stringify({ withId }) });
  if(res.ok){ await loadProducts(); } else { alert('Không đổi được vị trí sản phẩm.'); }
}

function renderProductList(){
  const q = productSearch.trim().toLowerCase();
  const list = products.filter(p =>
    (!q || p.name.toLowerCase().includes(q)) &&
    (productCategoryFilter === 'all' || p.category === productCategoryFilter) &&
    (productStatusFilter === 'all'
      || (productStatusFilter === 'visible' && !p.hidden)
      || (productStatusFilter === 'hidden' && p.hidden)
      || (productStatusFilter === 'instock' && p.totalStock > 0)
      || (productStatusFilter === 'outofstock' && p.totalStock <= 0))
  );
  // MỚI: tự động nhóm theo trạng thái - còn hàng trước, ẩn ở giữa, hết hàng dồn cuối
  // (vẫn giữ nguyên thứ tự ghim/mũi tên đang sắp trong từng nhóm)
  function productGroupRank(p){ return p.hidden ? 1 : (p.totalStock > 0 ? 0 : 2); }
  list.sort((a, b) => productGroupRank(a) - productGroupRank(b));
  const wrap = document.getElementById('productList');

  // MỚI: phân trang - 60 sản phẩm mỗi trang
  const totalPages = Math.max(1, Math.ceil(list.length / PRODUCTS_PER_PAGE));
  if(productPage > totalPages) productPage = totalPages;
  if(productPage < 1) productPage = 1;
  const pageItems = list.slice((productPage - 1) * PRODUCTS_PER_PAGE, productPage * PRODUCTS_PER_PAGE);

  // MỚI: bỏ chọn sản phẩm không còn hiện trong danh sách đã lọc
  const filteredIds = new Set(list.map(p => p.id));
  selectedProductIds.forEach(id => { if(!filteredIds.has(id)) selectedProductIds.delete(id); });
  const allSelected = list.length > 0 && list.every(p => selectedProductIds.has(p.id));

  const bulkBar = `
    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; margin-bottom:10px;">
      <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600;">
        <input type="checkbox" ${allSelected ? 'checked' : ''} onchange="toggleSelectAllProducts(this.checked)"> Chọn tất cả (${list.length})
      </label>
      ${selectedProductIds.size > 0 ? `<button onclick="clearSelectedProducts()" style="font-size:12px;">Bỏ chọn tất cả</button>` : ''}
      <span style="font-size:13px; color:var(--ink-soft);">Đã chọn: ${selectedProductIds.size}</span>
      ${selectedProductIds.size > 0 ? `
        <button onclick="bulkHideProducts()" style="font-size:12px;">Ẩn đã chọn</button>
        <button class="danger" onclick="bulkDeleteProducts()" style="font-size:12px;">Xoá đã chọn</button>
      ` : ''}
    </div>
    ${selectedProductIds.size > 0 ? renderBulkEditPanel() : ''}
  `;

  // MỚI: có sản phẩm nào đang ghim không - nếu có thì tạm khoá mũi tên lên/xuống
  // của các sản phẩm khác để tránh rối (ghim luôn quyết định vị trí đầu tiên)
  const anyPinned = products.some(pp => pp.pinned);

  wrap.innerHTML = bulkBar + `<p style="font-size:12px; color:var(--ink-soft); margin-bottom:8px;">${list.length} sản phẩm · Trang ${productPage}/${totalPages}</p>` +
    pageItems.map((p, i) => {
      const variants = (p.variants && p.variants.length) ? p.variants : [];
      const priceLabel = p.priceMin === p.priceMax ? fmt(p.priceMin) : `${fmt(p.priceMin)} - ${fmt(p.priceMax)}`;
      const isOpen = expandedProductId === p.id;
      const panel = isOpen ? renderVariantPanel(p) : '';
      // MỚI: mũi tên đổi chỗ với sản phẩm liền kề TRÊN CÙNG TRANG đang xem
      const prevNeighbor = i > 0 ? pageItems[i - 1] : null;
      const nextNeighbor = i < pageItems.length - 1 ? pageItems[i + 1] : null;
      const arrowsDisabled = anyPinned && !p.pinned;
      return `
      <div class="product-row" style="align-items:flex-start;">
        <input type="checkbox" ${selectedProductIds.has(p.id) ? 'checked' : ''} onchange="toggleSelectProduct('${p.id}', this.checked)" style="margin-top:12px;">
        <div style="display:flex; flex-direction:column; gap:2px; margin-top:10px;">
          <button onclick="moveProduct('${p.id}', '${prevNeighbor ? prevNeighbor.id : ''}')" ${(!prevNeighbor || arrowsDisabled) ? 'disabled' : ''} title="Lên" style="padding:2px 6px; line-height:1;">▲</button>
          <button onclick="moveProduct('${p.id}', '${nextNeighbor ? nextNeighbor.id : ''}')" ${(!nextNeighbor || arrowsDisabled) ? 'disabled' : ''} title="Xuống" style="padding:2px 6px; line-height:1;">▼</button>
        </div>
        ${p.image ? `<img src="${escapeHtml(p.image)}" class="pi" style="width:40px;height:40px;border-radius:8px;object-fit:cover;">` : `<div class="pi">🎁</div>`}
        <div class="pinfo">
          <b>${escapeHtml(p.name)}${p.pinned ? ' · <span style="color:#3C3489; font-weight:600;">📌 Đang ghim đầu</span>' : ''}</b>
          <span>${escapeHtml(catLabel(p.category))} · ${priceLabel} · Tổng tồn: ${p.totalStock}${variants.length > 1 ? ` · ${variants.length} phân loại` : ''}${p.hidden ? ' · <span style="color:#B23A3A; font-weight:600;">🙈 Đang ẩn</span>' : ''}</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <button onclick="pinProduct('${p.id}')">${p.pinned ? '📌 Bỏ ghim' : '📌 Ghim đầu'}</button>
          <button onclick="toggleVariantPanel('${p.id}')">${isOpen ? 'Đóng' : 'Sửa giá/kho/ảnh'}</button>
          <button onclick="toggleSharePanel('${p.id}')">${expandedShareId === p.id ? 'Đóng chia sẻ' : '🔗 Chia sẻ'}</button>
          <button onclick="duplicateProduct('${p.id}')">📄 Sao chép</button>
          <button class="danger" onclick="deleteProduct('${p.id}')">Xóa</button>
        </div>
      </div>
      ${panel}
      ${expandedShareId === p.id ? renderSharePanel(p) : ''}
    `;
    }).join('') + renderPager(totalPages);

  // MỚI: vẽ mã QR sau khi HTML đã chèn vào trang (canvas phải tồn tại trước)
  if(expandedShareId){
    const shared = list.find(p => p.id === expandedShareId);
    if(shared) drawShareQr(shared.id);
  }
}

// MỚI: mở/đóng khung "Chia sẻ đợt gom" (link trực tiếp tới sản phẩm + mã QR để
// đăng lên Threads/FB/TikTok, tránh nền tảng hạn chế hiển thị link ngoài)
function toggleSharePanel(id){
  expandedShareId = (expandedShareId === id) ? null : id;
  renderProductList();
}

function renderSharePanel(p){
  const link = `${window.location.origin}/?p=${encodeURIComponent(p.id)}`;
  return `
    <div style="background:#FAFAFC; border:1px dashed var(--line); border-radius:10px; padding:14px; margin:6px 0 10px;">
      <p style="font-size:13px; font-weight:600; margin:0 0 10px;">Chia sẻ đợt gom: ${escapeHtml(p.name)}</p>
      <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
        <input id="share-link-${p.id}" readonly value="${escapeHtml(link)}" style="flex:1; min-width:220px; font-size:12px;">
        <button onclick="copyShareLink('${p.id}')" id="share-copy-btn-${p.id}">Sao chép link</button>
      </div>
      <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
        <div style="background:#fff; padding:8px; border-radius:8px; border:1px solid var(--line);">
          <canvas id="share-qr-${p.id}" width="140" height="140"></canvas>
        </div>
        <div style="flex:1; min-width:180px; display:flex; flex-direction:column; gap:8px;">
          <button onclick="downloadShareQr('${p.id}')">📥 Tải mã QR</button>
          <p style="font-size:12px; color:var(--ink-soft); margin:0;">Dùng ảnh QR khi đăng Threads/TikTok để tránh bị hạn chế hiển thị link. Khách quét mã hoặc bấm link đều mở thẳng đúng sản phẩm này.</p>
        </div>
      </div>
    </div>
  `;
}

function drawShareQr(id){
  const canvas = document.getElementById(`share-qr-${id}`);
  const input = document.getElementById(`share-link-${id}`);
  if(!canvas || !input || typeof QRious === 'undefined') return;
  new QRious({ element: canvas, value: input.value, size: 140, background: '#ffffff', foreground: '#3C3489' });
}

function copyShareLink(id){
  const input = document.getElementById(`share-link-${id}`);
  if(!input) return;
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = document.getElementById(`share-copy-btn-${id}`);
    if(!btn) return;
    const old = btn.textContent;
    btn.textContent = 'Đã sao chép';
    setTimeout(() => { btn.textContent = old; }, 1500);
  });
}

function downloadShareQr(id){
  const canvas = document.getElementById(`share-qr-${id}`);
  if(!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `qr-gom-don-${id}.png`;
  a.click();
}

// MỚI: thanh phân trang cho danh sách sản phẩm
function renderPager(totalPages){
  if(totalPages <= 1) return '';
  let numbers = '';
  for(let i = 1; i <= totalPages; i++){
    numbers += `<button class="page-btn ${i===productPage ? 'active' : ''}" onclick="productPage=${i}; renderProductList();">${i}</button>`;
  }
  return `
    <div class="pager">
      <button onclick="if(productPage>1){productPage--; renderProductList();}" ${productPage===1 ? 'disabled' : ''}>‹ Trước</button>
      ${numbers}
      <button onclick="if(productPage<${totalPages}){productPage++; renderProductList();}" ${productPage===totalPages ? 'disabled' : ''}>Sau ›</button>
    </div>
  `;
}

function toggleVariantPanel(id){
  expandedProductId = expandedProductId === id ? null : id;
  renderProductList();
}

function renderVariantPanel(p){
  const variants = (p.variants && p.variants.length) ? p.variants : [{ name: null, price: p.priceMin, stock: p.totalStock, image: '', weight: null }];
  const rows = variants.map((v, idx) => `
    <div class="variant-edit-row">
      <img src="${escapeHtml(v.image || p.image || '')}" class="variant-edit-thumb" onerror="this.style.visibility='hidden'">
      <div class="variant-edit-fields">
        <div class="variant-edit-name">${escapeHtml(v.name || 'Mặc định')}</div>
        <div class="form-row">
          <div class="form-field"><label>Giá</label><input type="number" id="v-price-${p.id}-${idx}" value="${v.price}"></div>
          <div class="form-field"><label>Tồn kho</label><input type="number" id="v-stock-${p.id}-${idx}" value="${v.stock}"></div>
          <div class="form-field"><label>Cân nặng (g)</label><input type="number" id="v-weight-${p.id}-${idx}" value="${v.weight || ''}" placeholder="Mặc định 500g"></div>
        </div>
        <div class="form-field">
          <label>Link ảnh riêng cho phân loại này (để trống = dùng ảnh chung sản phẩm)</label>
          <input type="text" id="v-image-${p.id}-${idx}" value="${escapeHtml(v.image || '')}" placeholder="https://...">
        </div>
        <div class="form-field">
          <label>Hoặc tải ảnh từ máy/điện thoại lên</label>
          <input type="file" accept="image/*" id="v-file-${p.id}-${idx}" onchange="uploadVariantImage('${p.id}', ${idx})">
          <span id="v-upload-status-${p.id}-${idx}" style="font-size:11px; color:var(--ink-soft); display:block; margin-top:4px;"></span>
        </div>
        <button onclick="saveVariant('${p.id}', ${idx})">Lưu phân loại này</button>
      </div>
    </div>
  `).join('');

  // MỚI: mô tả chi tiết + tối đa 9 ảnh mô tả, áp dụng cho cả sản phẩm (không theo từng phân loại)
  const detailImages = p.detailImages || [];
  const detailImgSlots = Array.from({ length: 9 }).map((_, idx) => {
    const url = detailImages[idx] || '';
    return `
      <div class="detail-img-slot">
        <img src="${escapeHtml(url)}" class="variant-edit-thumb" onerror="this.style.visibility='hidden'">
        <input type="text" id="di-url-${p.id}-${idx}" value="${escapeHtml(url)}" placeholder="Ảnh mô tả ${idx+1}" oninput="setDetailImageUrl('${p.id}', ${idx}, this.value)">
        <input type="file" accept="image/*" id="di-file-${p.id}-${idx}" onchange="uploadDetailImage('${p.id}', ${idx})">
        <span id="di-status-${p.id}-${idx}" style="font-size:10px; color:var(--ink-soft);"></span>
      </div>
    `;
  }).join('');

  const descPanel = `
    <div class="product-desc-edit">
      <div class="form-field">
        <label>Tên sản phẩm</label>
        <input type="text" id="name-${p.id}" value="${escapeHtml(p.name || '')}">
      </div>
      <div class="form-field">
        <label>Ảnh đại diện sản phẩm (hiển thị ở trang chủ và danh sách sản phẩm)</label>
        <div style="display:flex; gap:10px; align-items:flex-start; margin-bottom:8px;">
          <img id="cover-preview-${p.id}" src="${escapeHtml(p.image || '')}" class="variant-edit-thumb" onerror="this.style.visibility='hidden'">
          <div style="flex:1;">
            <input type="text" id="cover-image-${p.id}" value="${escapeHtml(p.image || '')}" placeholder="https://..." oninput="setCoverImagePreview('${p.id}', this.value)">
            <input type="file" accept="image/*" id="cover-file-${p.id}" onchange="uploadCoverImage('${p.id}')" style="margin-top:6px;">
            <span id="cover-upload-status-${p.id}" style="font-size:11px; color:var(--ink-soft); display:block; margin-top:4px;"></span>
          </div>
        </div>
        ${variants.some(v => v.image) ? `
          <p style="font-size:12px; color:var(--ink-soft); margin:6px 0 4px;">Hoặc dùng luôn ảnh của 1 phân loại làm ảnh đại diện:</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${variants.map((v, idx) => v.image ? `<img src="${escapeHtml(v.image)}" class="variant-edit-thumb" style="cursor:pointer;" title="${escapeHtml(v.name || 'Dùng ảnh này')}" onclick="setCoverImageFromVariant('${p.id}', ${idx})">` : '').join('')}
          </div>
        ` : ''}
      </div>
      <div class="form-field">
        <label>Danh mục</label>
        <select id="cat-${p.id}">
          ${categories.map(c => `<option value="${c.key}" ${p.category===c.key?'selected':''}>${escapeHtml(c.label)}</option>`).join('')}
        </select>
      </div>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px; margin:8px 0;">
        <input type="checkbox" id="hidden-${p.id}" ${p.hidden ? 'checked' : ''}> Ẩn sản phẩm này khỏi trang khách xem
      </label>
      <div class="form-field">
        <label>Mô tả chi tiết sản phẩm</label>
        <textarea id="desc-${p.id}" placeholder="Chất liệu, kích thước, cách bảo quản, lưu ý khi dùng...">${escapeHtml(p.description || '')}</textarea>
      </div>
      <div class="form-field">
        <label>Ảnh mô tả chi tiết (tối đa 9 ảnh, để trống ô nào thì ô đó không hiện)</label>
        <div class="detail-img-grid">${detailImgSlots}</div>
      </div>
      <button onclick="saveProductDetail('${p.id}')">Lưu tên, danh mục, mô tả, ảnh đại diện & ảnh chi tiết</button>
    </div>
  `;

  return `<div class="variant-edit-panel">${descPanel}${rows}</div>`;
}

function getProductById(id){ return products.find(p => p.id === id); }

// MỚI: gõ link ảnh mô tả trực tiếp
function setDetailImageUrl(id, idx, value){
  const p = getProductById(id);
  if(!p) return;
  if(!p.detailImages) p.detailImages = [];
  p.detailImages[idx] = value;
}

// MỚI: tải ảnh mô tả từ máy lên
async function uploadDetailImage(id, idx){
  const fileInput = document.getElementById(`di-file-${id}-${idx}`);
  const statusEl = document.getElementById(`di-status-${id}-${idx}`);
  const file = fileInput.files[0];
  if(!file) return;
  statusEl.textContent = 'Đang tải...';
  const formData = new FormData();
  formData.append('image', file);
  try{
    const res = await fetch('/api/upload-image', { method: 'POST', headers: { 'x-admin-key': adminKey }, body: formData });
    if(!res.ok){ const err = await res.json().catch(() => ({})); statusEl.textContent = err.error || 'Lỗi tải ảnh.'; return; }
    const data = await res.json();
    const p = getProductById(id);
    if(!p.detailImages) p.detailImages = [];
    p.detailImages[idx] = data.url;
    document.getElementById(`di-url-${id}-${idx}`).value = data.url;
    statusEl.textContent = 'Đã tải xong.';
  } catch(e){ statusEl.textContent = 'Lỗi kết nối.'; }
}

// MỚI: xem trước ảnh đại diện khi gõ/dán link
function setCoverImagePreview(id, url){
  const preview = document.getElementById(`cover-preview-${id}`);
  if(preview) preview.src = url;
}

// MỚI: bấm chọn ảnh của 1 phân loại để dùng làm ảnh đại diện, không cần tải lại
function setCoverImageFromVariant(id, idx){
  const p = getProductById(id);
  if(!p) return;
  const variants = (p.variants && p.variants.length) ? p.variants : [];
  const v = variants[idx];
  if(!v || !v.image) return;
  const input = document.getElementById(`cover-image-${id}`);
  if(input) input.value = v.image;
  setCoverImagePreview(id, v.image);
}

// MỚI: tải ảnh đại diện mới từ máy/điện thoại lên
async function uploadCoverImage(id){
  const fileInput = document.getElementById(`cover-file-${id}`);
  const statusEl = document.getElementById(`cover-upload-status-${id}`);
  const file = fileInput.files[0];
  if(!file) return;
  statusEl.textContent = 'Đang tải ảnh lên...';
  const formData = new FormData();
  formData.append('image', file);
  try{
    const res = await fetch('/api/upload-image', { method: 'POST', headers: { 'x-admin-key': adminKey }, body: formData });
    if(!res.ok){
      const err = await res.json().catch(() => ({}));
      statusEl.textContent = err.error || 'Tải ảnh lên thất bại.';
      return;
    }
    const data = await res.json();
    document.getElementById(`cover-image-${id}`).value = data.url;
    setCoverImagePreview(id, data.url);
    statusEl.textContent = 'Đã tải ảnh lên xong — nhớ bấm "Lưu" bên dưới để áp dụng.';
  } catch(e){ statusEl.textContent = 'Lỗi kết nối.'; }
}

// MỚI: lưu mô tả + ảnh đại diện + ảnh mô tả (khác API với sửa giá/kho/cân nặng vì đây là dữ liệu chung cả sản phẩm)
async function saveProductDetail(id){
  const p = getProductById(id);
  if(!p) return;
  const name = document.getElementById(`name-${id}`).value.trim();
  if(!name){ alert('Tên sản phẩm không được để trống.'); return; }
  const category = document.getElementById(`cat-${id}`).value;
  const hidden = document.getElementById(`hidden-${id}`).checked;
  const description = document.getElementById(`desc-${id}`).value;
  const image = document.getElementById(`cover-image-${id}`).value.trim();
  const detailImages = (p.detailImages || []).filter(u => u && u.trim());
  const res = await apiFetch(`/api/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, category, hidden, description, image, detailImages })
  });
  if(res.ok){ await loadProducts(); showAdminToast('✓ Đã cập nhật sản phẩm'); } else { alert('Không lưu được, thử lại.'); }
}

// MỚI: thông báo nhỏ báo lưu thành công, tự ẩn sau ~1.8s (dùng lại đúng kiểu toast
// "Đã thêm vào giỏ hàng" bên trang khách, cùng class CSS .add-to-cart-toast)
let adminToastTimeout = null;
function showAdminToast(message){
  let toast = document.getElementById('adminToast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'adminToast';
    toast.className = 'add-to-cart-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(adminToastTimeout);
  adminToastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 1800);
}

async function uploadVariantImage(id, idx){
  const fileInput = document.getElementById(`v-file-${id}-${idx}`);
  const statusEl = document.getElementById(`v-upload-status-${id}-${idx}`);
  const file = fileInput.files[0];
  if(!file) return;
  statusEl.textContent = 'Đang tải ảnh lên...';
  const formData = new FormData();
  formData.append('image', file);
  try{
    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey },
      body: formData
    });
    if(!res.ok){
      const err = await res.json().catch(() => ({}));
      statusEl.textContent = err.error || 'Tải ảnh lên thất bại.';
      return;
    }
    const data = await res.json();
    document.getElementById(`v-image-${id}-${idx}`).value = data.url;
    statusEl.textContent = 'Đã tải ảnh lên xong — nhớ bấm "Lưu phân loại này" để áp dụng.';
  } catch(e){
    statusEl.textContent = 'Lỗi kết nối, thử lại.';
  }
}

async function saveVariant(id, idx){
  const price = document.getElementById(`v-price-${id}-${idx}`).value;
  const stock = document.getElementById(`v-stock-${id}-${idx}`).value;
  const image = document.getElementById(`v-image-${id}-${idx}`).value.trim();
  const weightInput = document.getElementById(`v-weight-${id}-${idx}`).value;
  const weight = weightInput === '' ? '' : Number(weightInput);
  const res = await apiFetch(`/api/products/${id}/variant/${idx}`, {
    method: 'PUT',
    body: JSON.stringify({ price: Number(price), stock: Number(stock), image, weight })
  });
  if(res.ok){ await loadProducts(); showAdminToast('✓ Đã cập nhật phân loại'); } else alert('Không cập nhật được.');
}

async function addProduct(){
  const msgEl = document.getElementById('addProductMsg');
  const name = document.getElementById('np-name').value.trim();
  const category = document.getElementById('np-cat').value;
  const image = document.getElementById('np-image').value.trim();
  const description = document.getElementById('np-desc').value.trim();
  const hidden = document.getElementById('np-hidden').checked;

  const variants = newProductSkus.map(s => ({
    name: s.name.trim() || null,
    price: Number(s.price) || 0,
    stock: Number(s.stock) || 0,
    image: s.image.trim(),
    weight: s.weight === '' ? null : Number(s.weight)
  }));
  const detailImages = newProductImages.map(i => i.url.trim()).filter(Boolean);

  if(!name){ msgEl.textContent = 'Nhập tên sản phẩm.'; return; }
  if(!variants.some(v => v.price > 0)){ msgEl.textContent = 'Nhập giá cho ít nhất 1 phân loại.'; return; }

  msgEl.textContent = 'Đang thêm...';
  const res = await apiFetch('/api/products', {
    method: 'POST',
    body: JSON.stringify({ name, category, image, description, variants, detailImages, hidden })
  });
  if(res.ok){
    msgEl.textContent = '';
    await loadProducts();
  } else {
    const err = await res.json().catch(() => ({}));
    msgEl.textContent = err.error || 'Không thêm được sản phẩm.';
  }
}

// MỚI: sao chép 1 sản phẩm thành sản phẩm mới (giữ nguyên tên, danh mục, ảnh, mô tả,
// các phân loại/giá/kho/cân nặng, ảnh mô tả chi tiết). Bản sao mặc định ĐANG ẨN khỏi
// trang khách để tránh 2 sản phẩm giống hệt nhau hiện ra cùng lúc trước khi kịp sửa
// (VD đổi tên, đổi giá/kho) - vào "Sửa giá/kho/ảnh" bỏ tick ẩn khi sẵn sàng bán.
async function duplicateProduct(id){
  const p = getProductById(id);
  if(!p) return;
  const body = {
    name: `${p.name} (bản sao)`,
    category: p.category,
    image: p.image || '',
    description: p.description || '',
    variants: (p.variants && p.variants.length ? p.variants : [{ name: null, price: p.priceMin, stock: p.totalStock, image: '', weight: null }])
      .map(v => ({ name: v.name || null, price: v.price, stock: v.stock, image: v.image || '', weight: v.weight })),
    detailImages: p.detailImages || [],
    hidden: true,
  };
  const res = await apiFetch('/api/products', { method: 'POST', body: JSON.stringify(body) });
  if(res.ok){
    await loadProducts();
  } else {
    alert('Không sao chép được sản phẩm.');
  }
}

async function deleteProduct(id){
  if(!confirm('Xóa sản phẩm này?')) return;
  const res = await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
  if(res.ok) await loadProducts();
}

// ---------- MỚI: Vận chuyển (cân nặng mặc định, mốc phí, freeship) ----------
async function loadShippingSettings(){
  const res = await apiFetch('/api/admin/shipping-config');
  if(!res.ok){
    document.getElementById('shippingTab').innerHTML = `<p style="color:#B23A3A; font-size:14px;">Không tải được cấu hình vận chuyển.</p>`;
    return;
  }
  shippingConfig = await res.json();
  // MỚI: chuyển dữ liệu freeship theo định dạng cũ (rule.category + rule.minOrderValue,
  // chỉ 1 danh mục/quy tắc) sang định dạng mới (rule.targets = nhiều danh mục, mỗi cái
  // 1 ngưỡng riêng) — để không mất cấu hình đã lưu từ trước khi có tính năng này
  shippingConfig.freeshipRules = (shippingConfig.freeshipRules || []).map(r =>
    r.targets ? r : { label: r.label, active: r.active, targets: [{ category: r.category, minOrderValue: r.minOrderValue }] }
  );
  shippingLoaded = true;
  renderShippingTab();
}

function renderShippingTab(){
  const wrap = document.getElementById('shippingTab');
  wrap.innerHTML = `
    <div class="add-product-form">
      <h3>⚖️ Cân nặng & mốc phí</h3>
      <div class="form-row">
        <div class="form-field"><label>Cân nặng mặc định (g)</label><input type="number" id="sc-default-weight" value="${shippingConfig.defaultWeightGram}"></div>
        <div class="form-field"><label>Phí mỗi kg vượt mốc cao nhất (đ)</label><input type="number" id="sc-extra-fee" value="${shippingConfig.extraFeePerKgAboveMax}"></div>
      </div>
      <p style="font-size:12px; color:var(--ink-soft); margin:6px 0 10px;">Áp dụng cho sản phẩm chưa nhập cân nặng riêng (sửa trong tab Sản phẩm).</p>

      <h4 style="font-size:14px; margin:14px 0 8px;">Mốc phí theo tổng cân nặng đơn hàng</h4>
      <div id="weightTiersList">${renderWeightTierRows()}</div>
      <button onclick="addWeightTierRow()" style="margin-top:4px;">+ Thêm mốc</button>
    </div>

    <div class="add-product-form">
      <h3>🎁 Quy tắc Freeship</h3>
      <div id="freeshipRulesList">${renderFreeshipRuleRows()}</div>
      <button onclick="addFreeshipRuleRow()" style="margin-top:4px;">+ Thêm quy tắc freeship</button>
    </div>

    <div class="add-product-form">
      <h3>🎀 Gói quà tặng</h3>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:10px;">Vẫn tính phí theo số lượng sản phẩm như trước (1 sản phẩm / 2 sản phẩm / miễn phí từ mức nào đó) — chỉ khác là mô tả và các mốc giá dưới đây giờ tự chỉnh được, không cần sửa code nữa.</p>
      ${renderGiftWrapSettings()}
    </div>

    <div class="add-product-form">
      <h3>🧩 Dịch vụ / sản phẩm kèm thêm khác</h3>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:10px;">Mỗi mục có 1 giá cố định (không tính theo số lượng). Khách sẽ thấy các mục đang "Áp dụng" dưới dạng ô tick chọn lúc đặt hàng.</p>
      <div id="addOnsList">${renderAddOnRows()}</div>
      <button onclick="addAddOnRow()" style="margin-top:8px;">+ Thêm dịch vụ/sản phẩm kèm thêm</button>
    </div>

    <button onclick="saveShippingConfig()" style="background:var(--sage-deep); color:#fff; border:none; padding:10px 18px; border-radius:10px; font-weight:600; cursor:pointer;">Lưu cài đặt vận chuyển</button>
    <p id="shippingConfigMsg" style="font-size:13px; margin-top:10px; color:var(--sage-deep);"></p>
  `;
}

// MỚI: đảm bảo shippingConfig luôn có sẵn khối giftWrap + mảng addOns (đề phòng cấu hình cũ chưa có)
function ensureGiftWrapAndAddOns(){
  if(!shippingConfig.giftWrap){
    shippingConfig.giftWrap = { active: true, label: 'Gói quà tặng (giấy kraft tổ ong + ruy băng)', priceFor1: 3000, priceFor2: 5000, freeFromQty: 3 };
  }
  if(!shippingConfig.addOns){
    shippingConfig.addOns = [];
  }
}

function renderGiftWrapSettings(){
  ensureGiftWrapAndAddOns();
  const g = shippingConfig.giftWrap;
  return `
    <label style="display:flex; align-items:center; gap:6px; font-size:13px; margin-bottom:10px;">
      <input type="checkbox" ${g.active ? 'checked' : ''} onchange="shippingConfig.giftWrap.active=this.checked"> Đang áp dụng (bỏ tick để tạm ẩn khỏi trang đặt hàng)
    </label>
    <div class="form-field">
      <label>Mô tả (khách sẽ thấy dòng này)</label>
      <input type="text" value="${escapeHtml(g.label)}" onchange="shippingConfig.giftWrap.label=this.value">
    </div>
    <div class="form-row">
      <div class="form-field"><label>Giá khi có 1 sản phẩm (đ)</label><input type="number" value="${g.priceFor1}" onchange="shippingConfig.giftWrap.priceFor1=Number(this.value)"></div>
      <div class="form-field"><label>Giá khi có 2 sản phẩm (đ, tính tổng)</label><input type="number" value="${g.priceFor2}" onchange="shippingConfig.giftWrap.priceFor2=Number(this.value)"></div>
      <div class="form-field"><label>Miễn phí từ (sản phẩm)</label><input type="number" value="${g.freeFromQty}" onchange="shippingConfig.giftWrap.freeFromQty=Number(this.value)"></div>
    </div>
  `;
}

function renderAddOnRows(){
  ensureGiftWrapAndAddOns();
  if(shippingConfig.addOns.length === 0){
    return `<p style="font-size:13px; color:var(--ink-soft);">Chưa có mục nào.</p>`;
  }
  return shippingConfig.addOns.map((a, idx) => `
    <div style="border:1px solid var(--line); border-radius:12px; padding:12px; margin-bottom:10px;">
      <div class="form-row">
        <div class="form-field"><label>Tên dịch vụ/sản phẩm</label><input type="text" value="${escapeHtml(a.label)}" onchange="shippingConfig.addOns[${idx}].label=this.value"></div>
        <div class="form-field"><label>Giá (đ)</label><input type="number" value="${a.price}" onchange="shippingConfig.addOns[${idx}].price=Number(this.value)"></div>
      </div>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px; margin:6px 0;">
        <input type="checkbox" ${a.active?'checked':''} onchange="shippingConfig.addOns[${idx}].active=this.checked"> Đang áp dụng
      </label>
      <button class="danger" onclick="removeAddOnRow(${idx})">Xóa mục này</button>
    </div>
  `).join('');
}
function addAddOnRow(){
  ensureGiftWrapAndAddOns();
  shippingConfig.addOns.push({ id: 'addon' + Date.now(), label: 'Dịch vụ mới', price: 0, active: true });
  document.getElementById('addOnsList').innerHTML = renderAddOnRows();
}
function removeAddOnRow(idx){
  shippingConfig.addOns.splice(idx, 1);
  document.getElementById('addOnsList').innerHTML = renderAddOnRows();
}

function renderWeightTierRows(){
  return shippingConfig.weightTiers.map((t, idx) => `
    <div class="form-row" style="align-items:flex-end; margin-bottom:8px;">
      <div class="form-field"><label>Tối đa (g)</label><input type="number" value="${t.maxWeightGram}" onchange="shippingConfig.weightTiers[${idx}].maxWeightGram=Number(this.value)"></div>
      <div class="form-field"><label>Phí (đ)</label><input type="number" value="${t.fee}" onchange="shippingConfig.weightTiers[${idx}].fee=Number(this.value)"></div>
      <button class="danger" onclick="removeWeightTierRow(${idx})">Xóa</button>
    </div>
  `).join('');
}
function addWeightTierRow(){
  shippingConfig.weightTiers.push({ maxWeightGram: 0, fee: 0 });
  document.getElementById('weightTiersList').innerHTML = renderWeightTierRows();
}
function removeWeightTierRow(idx){
  shippingConfig.weightTiers.splice(idx, 1);
  document.getElementById('weightTiersList').innerHTML = renderWeightTierRows();
}

function renderFreeshipRuleRows(){
  if(shippingConfig.freeshipRules.length === 0){
    return `<p style="font-size:13px; color:var(--ink-soft);">Chưa có quy tắc freeship nào.</p>`;
  }
  return shippingConfig.freeshipRules.map((r, idx) => `
    <div style="border:1px solid var(--line); border-radius:12px; padding:12px; margin-bottom:10px;">
      <div class="form-field">
        <label>Mô tả (khách sẽ thấy dòng này)</label>
        <input type="text" value="${escapeHtml(r.label)}" onchange="shippingConfig.freeshipRules[${idx}].label=this.value">
      </div>
      <p style="font-size:12px; color:var(--ink-soft); margin:10px 0 6px;">Áp dụng khi khách mua ĐỦ 1 TRONG CÁC điều kiện dưới đây (đạt 1 cái là được freeship, không cần đủ hết):</p>
      <div id="freeship-targets-${idx}">${renderFreeshipTargetRows(idx)}</div>
      <button onclick="addFreeshipTargetRow(${idx})" style="margin-top:6px; font-size:12px; padding:6px 12px;">+ Thêm danh mục vào quy tắc này</button>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px; margin:10px 0;">
        <input type="checkbox" ${r.active?'checked':''} onchange="shippingConfig.freeshipRules[${idx}].active=this.checked"> Đang áp dụng
      </label>
      <button class="danger" onclick="removeFreeshipRuleRow(${idx})">Xóa quy tắc này</button>
    </div>
  `).join('');
}

// MỚI: danh sách danh mục + ngưỡng giá riêng bên trong 1 quy tắc freeship
function renderFreeshipTargetRows(ruleIdx){
  const targets = shippingConfig.freeshipRules[ruleIdx].targets;
  return targets.map((t, tIdx) => `
    <div class="form-row" style="align-items:flex-end; margin-bottom:6px;">
      <div class="form-field">
        <label>Áp dụng cho</label>
        <select style="width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--line);" onchange="shippingConfig.freeshipRules[${ruleIdx}].targets[${tIdx}].category=this.value">
          <option value="all" ${t.category==='all'?'selected':''}>Toàn đơn hàng</option>
          ${categories.map(c => `<option value="${c.key}" ${t.category===c.key?'selected':''}>${escapeHtml(c.label)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field"><label>Từ giá trị (đ)</label><input type="number" value="${t.minOrderValue}" onchange="shippingConfig.freeshipRules[${ruleIdx}].targets[${tIdx}].minOrderValue=Number(this.value)"></div>
      ${targets.length > 1 ? `<button class="danger" onclick="removeFreeshipTargetRow(${ruleIdx}, ${tIdx})">Xóa</button>` : ''}
    </div>
  `).join('');
}

// MỚI: thêm 1 danh mục (kèm ngưỡng riêng) vào quy tắc freeship đang có
function addFreeshipTargetRow(ruleIdx){
  shippingConfig.freeshipRules[ruleIdx].targets.push({ category: 'all', minOrderValue: 0 });
  document.getElementById(`freeship-targets-${ruleIdx}`).innerHTML = renderFreeshipTargetRows(ruleIdx);
}
// MỚI: bớt 1 danh mục khỏi quy tắc freeship (luôn giữ lại ít nhất 1 danh mục trong quy tắc)
function removeFreeshipTargetRow(ruleIdx, targetIdx){
  const targets = shippingConfig.freeshipRules[ruleIdx].targets;
  if(targets.length <= 1) return;
  targets.splice(targetIdx, 1);
  document.getElementById(`freeship-targets-${ruleIdx}`).innerHTML = renderFreeshipTargetRows(ruleIdx);
}

function addFreeshipRuleRow(){
  shippingConfig.freeshipRules.push({ label: 'Freeship mới', active: true, targets: [{ category: 'all', minOrderValue: 0 }] });
  document.getElementById('freeshipRulesList').innerHTML = renderFreeshipRuleRows();
}
function removeFreeshipRuleRow(idx){
  shippingConfig.freeshipRules.splice(idx, 1);
  document.getElementById('freeshipRulesList').innerHTML = renderFreeshipRuleRows();
}

async function saveShippingConfig(){
  shippingConfig.defaultWeightGram = Number(document.getElementById('sc-default-weight').value) || 0;
  shippingConfig.extraFeePerKgAboveMax = Number(document.getElementById('sc-extra-fee').value) || 0;
  const res = await apiFetch('/api/admin/shipping-config', {
    method: 'POST',
    body: JSON.stringify(shippingConfig)
  });
  const msgEl = document.getElementById('shippingConfigMsg');
  if(res.ok){ msgEl.textContent = 'Đã lưu cài đặt vận chuyển ✅'; }
  else { msgEl.textContent = 'Lỗi khi lưu, thử lại.'; }
}

// ---------- MỚI: Trang chủ (banner xoay vòng + bộ sưu tập nổi bật) ----------
async function loadHomepageSettings(){
  const res = await apiFetch('/api/admin/homepage-content');
  if(!res.ok){
    document.getElementById('homepageTab').innerHTML = `<p style="color:#B23A3A; font-size:14px;">Không tải được nội dung trang chủ.</p>`;
    return;
  }
  homepageContent = await res.json();
  homepageLoaded = true;
  // MỚI: cần có danh sách danh mục để đồng bộ bộ sưu tập, phòng khi mở tab Trang chủ
  // trước khi từng vào tab Sản phẩm (nơi danh mục được tải lần đầu)
  if(!categoriesLoaded){ await loadCategories(); }
  syncCollectionsWithCategories();
  renderHomepageTab();
}

// MỚI: tự động đồng bộ "Bộ sưu tập nổi bật" theo đúng danh sách danh mục hiện có (thêm/xoá
// danh mục trong tab Sản phẩm → Quản lý danh mục sẽ tự phản ánh vào đây) — giữ lại ảnh đã
// chọn và trạng thái ẩn/hiện của các danh mục đã có từ trước, danh mục mới thêm mặc định
// chưa có ảnh và đang hiện
function syncCollectionsWithCategories(){
  const byKey = new Map((homepageContent.collections || []).map(c => [c.category, c]));
  homepageContent.collections = categories.map(cat => {
    const existing = byKey.get(cat.key);
    return {
      category: cat.key,
      label: cat.label, // MỚI: luôn lấy đúng tên danh mục hiện tại, không cho sửa riêng ở đây nữa
      image: existing ? (existing.image || '') : '',
      hidden: existing ? !!existing.hidden : false
    };
  });
}

function renderHomepageTab(){
  const wrap = document.getElementById('homepageTab');
  wrap.innerHTML = `
    <div class="add-product-form">
      <h3>🖼️ Banner trang chủ (tối đa 3 ảnh, xoay vòng)</h3>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:10px;">Để trống ô nào thì ảnh đó không hiện trên web. Nếu chỉ có 1 ảnh, nút chuyển ảnh sẽ tự ẩn.</p>
      <div id="heroSlidesList">${renderHeroSlideRows()}</div>
    </div>
    <div class="add-product-form">
      <h3>🗂️ Bộ sưu tập nổi bật (tự động lấy theo danh mục sản phẩm)</h3>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:10px;">Danh sách dưới đây LUÔN khớp với danh mục sản phẩm hiện có (thêm/sửa tên/xoá danh mục ở tab Sản phẩm → Quản lý danh mục). Mỗi danh mục có thể tự chỉnh ảnh riêng và ẩn/hiện trên trang chủ mà không cần xoá hẳn.</p>
      <div id="collectionsList">${renderCollectionRows()}</div>
    </div>
    <div class="add-product-form">
      <h3>⭐ Sản phẩm nổi bật</h3>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:10px;">Tự đặt tiêu đề và chọn tay từng sản phẩm muốn ưu tiên hiển thị trên trang chủ.</p>
      <div class="form-field">
        <label>Tiêu đề hiển thị</label>
        <input type="text" id="fp-title" value="${escapeHtml((homepageContent.featuredProducts && homepageContent.featuredProducts.title) || 'Sản phẩm nổi bật')}" oninput="ensureFeaturedProducts(); homepageContent.featuredProducts.title=this.value">
      </div>
      <p style="font-size:12px; color:var(--ink-soft); margin:10px 0 6px;">Sản phẩm đã chọn:</p>
      <div id="featuredSelectedList">${renderFeaturedSelectedList()}</div>
      <input placeholder="Tìm sản phẩm để thêm..." style="margin-top:10px;" oninput="featuredProductSearch=this.value; document.getElementById('featuredSearchList').innerHTML = renderFeaturedSearchList();">
      <div id="featuredSearchList" style="max-height:220px; overflow-y:auto; margin-top:8px;"></div>
    </div>
    <div class="add-product-form">
      <h3>🤝 Cam kết / Uy tín (khối 3 ô cuối trang chủ)</h3>
      <p style="font-size:12px; color:var(--ink-soft); margin-bottom:10px;">Tự thêm/sửa/xoá từng mục — mỗi mục gồm 1 icon (gõ emoji), tiêu đề và mô tả ngắn.</p>
      <div id="trustItemsList">${renderTrustItemRows()}</div>
      <button onclick="addTrustItemRow()" style="margin-top:8px;">+ Thêm mục</button>
    </div>
    <button onclick="saveHomepageContent()" style="background:var(--sage-deep); color:#fff; border:none; padding:10px 18px; border-radius:10px; font-weight:600; cursor:pointer;">Lưu nội dung trang chủ</button>
    <p id="homepageSaveMsg" style="font-size:13px; margin-top:10px; color:var(--sage-deep);"></p>
  `;
}

// MỚI: đảm bảo homepageContent luôn có sẵn khối featuredProducts (đề phòng nội dung cũ chưa có)
function ensureFeaturedProducts(){
  if(!homepageContent.featuredProducts){
    homepageContent.featuredProducts = { title: 'Sản phẩm nổi bật', productIds: [] };
  }
}

// MỚI: đảm bảo homepageContent luôn có sẵn mảng trustItems (đề phòng nội dung cũ chưa có)
function ensureTrustItems(){
  if(!homepageContent.trustItems){
    homepageContent.trustItems = [];
  }
}

function renderTrustItemRows(){
  ensureTrustItems();
  if(homepageContent.trustItems.length === 0){
    return `<p style="font-size:13px; color:var(--ink-soft);">Chưa có mục nào — bấm "+ Thêm mục" bên dưới.</p>`;
  }
  return homepageContent.trustItems.map((t, idx) => `
    <div class="variant-edit-row">
      <div style="width:56px; height:56px; border-radius:10px; background:var(--cream); border:1px solid var(--line); display:flex; align-items:center; justify-content:center; font-size:26px; flex:0 0 auto;">${escapeHtml(t.icon || '')}</div>
      <div class="variant-edit-fields">
        <div class="form-field">
          <label>Icon (gõ 1 emoji, VD: 🛒 🚚 ✋ 🎁 ⭐)</label>
          <input type="text" maxlength="4" value="${escapeHtml(t.icon || '')}" oninput="homepageContent.trustItems[${idx}].icon=this.value; document.getElementById('trustItemsList').innerHTML = renderTrustItemRows();">
        </div>
        <div class="form-field">
          <label>Tiêu đề</label>
          <input type="text" value="${escapeHtml(t.title || '')}" oninput="homepageContent.trustItems[${idx}].title=this.value">
        </div>
        <div class="form-field">
          <label>Mô tả ngắn</label>
          <input type="text" value="${escapeHtml(t.text || '')}" oninput="homepageContent.trustItems[${idx}].text=this.value">
        </div>
        <button class="danger" onclick="removeTrustItemRow(${idx})">Xoá mục này</button>
      </div>
    </div>
  `).join('');
}

// MỚI: thêm/bớt 1 mục trong khối "Cam kết / Uy tín"
function addTrustItemRow(){
  ensureTrustItems();
  homepageContent.trustItems.push({ icon: '⭐', title: 'Tiêu đề mới', text: 'Mô tả ngắn cho mục này.' });
  document.getElementById('trustItemsList').innerHTML = renderTrustItemRows();
}
function removeTrustItemRow(idx){
  homepageContent.trustItems.splice(idx, 1);
  document.getElementById('trustItemsList').innerHTML = renderTrustItemRows();
}

function renderFeaturedSelectedList(){
  ensureFeaturedProducts();
  const ids = homepageContent.featuredProducts.productIds;
  if(ids.length === 0) return `<p style="font-size:13px; color:var(--ink-soft);">Chưa chọn sản phẩm nào.</p>`;
  return ids.map(id => {
    const p = products.find(p => p.id === id);
    if(!p) return '';
    return `
      <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px dashed var(--line); font-size:13px;">
        ${p.image ? `<img src="${escapeHtml(p.image)}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;">` : `<span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">🎁</span>`}
        <span style="flex:1;">${escapeHtml(p.name)}</span>
        <button class="danger" onclick="removeFeaturedProduct('${id}')">Xoá</button>
      </div>
    `;
  }).join('');
}

function renderFeaturedSearchList(){
  ensureFeaturedProducts();
  const q = (featuredProductSearch || '').trim().toLowerCase();
  if(!q) return '';
  const selectedIds = new Set(homepageContent.featuredProducts.productIds);
  const results = products.filter(p => !selectedIds.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 30);
  if(results.length === 0) return `<p style="font-size:13px; color:var(--ink-soft);">Không tìm thấy sản phẩm.</p>`;
  return results.map(p => `
    <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px dashed var(--line); font-size:13px;">
      ${p.image ? `<img src="${escapeHtml(p.image)}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;">` : `<span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">🎁</span>`}
      <span style="flex:1;">${escapeHtml(p.name)}</span>
      <button onclick="addFeaturedProduct('${p.id}')">+ Thêm</button>
    </div>
  `).join('');
}

function addFeaturedProduct(id){
  ensureFeaturedProducts();
  if(!homepageContent.featuredProducts.productIds.includes(id)){
    homepageContent.featuredProducts.productIds.push(id);
  }
  document.getElementById('featuredSelectedList').innerHTML = renderFeaturedSelectedList();
  document.getElementById('featuredSearchList').innerHTML = renderFeaturedSearchList();
}

function removeFeaturedProduct(id){
  ensureFeaturedProducts();
  homepageContent.featuredProducts.productIds = homepageContent.featuredProducts.productIds.filter(x => x !== id);
  document.getElementById('featuredSelectedList').innerHTML = renderFeaturedSelectedList();
}

function renderHeroSlideRows(){
  return homepageContent.heroSlides.map((s, idx) => `
    <div class="variant-edit-row">
      <img src="${escapeHtml(s.image || '')}" class="variant-edit-thumb" onerror="this.style.visibility='hidden'">
      <div class="variant-edit-fields">
        <div class="variant-edit-name">Ảnh banner ${idx+1}</div>
        <div class="form-field">
          <label>Link ảnh</label>
          <input type="text" id="hero-img-${idx}" value="${escapeHtml(s.image || '')}" placeholder="https://..." oninput="homepageContent.heroSlides[${idx}].image=this.value">
        </div>
        <div class="form-field">
          <label>Hoặc tải ảnh từ máy/điện thoại lên</label>
          <input type="file" accept="image/*" id="hero-file-${idx}" onchange="uploadHeroSlideImage(${idx})">
          <span id="hero-status-${idx}" style="font-size:11px; color:var(--ink-soft); display:block; margin-top:4px;"></span>
        </div>
        <div class="form-field">
          <label>Link khi khách bấm vào ảnh (không bắt buộc)</label>
          <input type="text" value="${escapeHtml(s.link || '')}" placeholder="https://... hoặc để trống" oninput="homepageContent.heroSlides[${idx}].link=this.value">
        </div>
      </div>
    </div>
  `).join('');
}

function renderCollectionRows(){
  if(!homepageContent.collections || homepageContent.collections.length === 0){
    return `<p style="font-size:13px; color:var(--ink-soft);">Chưa có danh mục sản phẩm nào — thêm danh mục ở tab Sản phẩm → Quản lý danh mục trước.</p>`;
  }
  return homepageContent.collections.map((c, idx) => `
    <div class="variant-edit-row">
      <img src="${escapeHtml(c.image || '')}" class="variant-edit-thumb" onerror="this.style.visibility='hidden'">
      <div class="variant-edit-fields">
        <div class="variant-edit-name">${escapeHtml(c.label)}${c.hidden ? ' · <span style="color:#B23A3A; font-weight:600;">Đang ẩn khỏi trang chủ</span>' : ''}</div>
        <div class="form-field">
          <label>Link ảnh</label>
          <input type="text" id="col-img-${idx}" value="${escapeHtml(c.image || '')}" placeholder="https://..." oninput="homepageContent.collections[${idx}].image=this.value">
        </div>
        <div class="form-field">
          <label>Hoặc tải ảnh từ máy/điện thoại lên</label>
          <input type="file" accept="image/*" id="col-file-${idx}" onchange="uploadCollectionImage(${idx})">
          <span id="col-status-${idx}" style="font-size:11px; color:var(--ink-soft); display:block; margin-top:4px;"></span>
        </div>
        <label style="display:flex; align-items:center; gap:6px; font-size:13px; margin-top:6px;">
          <input type="checkbox" ${c.hidden ? 'checked' : ''} onchange="homepageContent.collections[${idx}].hidden=this.checked; document.getElementById('collectionsList').innerHTML = renderCollectionRows();"> Ẩn danh mục này khỏi trang chủ
        </label>
      </div>
    </div>
  `).join('');
}

async function uploadHeroSlideImage(idx){
  const fileInput = document.getElementById(`hero-file-${idx}`);
  const statusEl = document.getElementById(`hero-status-${idx}`);
  const file = fileInput.files[0];
  if(!file) return;
  statusEl.textContent = 'Đang tải ảnh lên...';
  const formData = new FormData();
  formData.append('image', file);
  try{
    const res = await fetch('/api/upload-image', { method: 'POST', headers: { 'x-admin-key': adminKey }, body: formData });
    if(!res.ok){ const err = await res.json().catch(() => ({})); statusEl.textContent = err.error || 'Tải ảnh lên thất bại.'; return; }
    const data = await res.json();
    homepageContent.heroSlides[idx].image = data.url;
    document.getElementById(`hero-img-${idx}`).value = data.url;
    statusEl.textContent = 'Đã tải ảnh lên xong.';
  } catch(e){ statusEl.textContent = 'Lỗi kết nối, thử lại.'; }
}

async function uploadCollectionImage(idx){
  const fileInput = document.getElementById(`col-file-${idx}`);
  const statusEl = document.getElementById(`col-status-${idx}`);
  const file = fileInput.files[0];
  if(!file) return;
  statusEl.textContent = 'Đang tải ảnh lên...';
  const formData = new FormData();
  formData.append('image', file);
  try{
    const res = await fetch('/api/upload-image', { method: 'POST', headers: { 'x-admin-key': adminKey }, body: formData });
    if(!res.ok){ const err = await res.json().catch(() => ({})); statusEl.textContent = err.error || 'Tải ảnh lên thất bại.'; return; }
    const data = await res.json();
    homepageContent.collections[idx].image = data.url;
    document.getElementById(`col-img-${idx}`).value = data.url;
    statusEl.textContent = 'Đã tải ảnh lên xong.';
  } catch(e){ statusEl.textContent = 'Lỗi kết nối, thử lại.'; }
}

async function saveHomepageContent(){
  const res = await apiFetch('/api/admin/homepage-content', {
    method: 'POST',
    body: JSON.stringify(homepageContent)
  });
  const msgEl = document.getElementById('homepageSaveMsg');
  if(res.ok){ msgEl.textContent = 'Đã lưu nội dung trang chủ ✅'; }
  else { msgEl.textContent = 'Lỗi khi lưu, thử lại.'; }
}

// ============================================================
// MỚI: Khuyến mãi (flash sale) - tạo/sửa/xoá chương trình, thêm/bớt sản phẩm tham gia,
// chỉnh giá giảm + giới hạn mua theo SĐT hàng loạt hoặc từng SKU, hẹn giờ, kết thúc sớm.
// ============================================================

async function loadPromotionsSettings(){
  const res = await apiFetch('/api/admin/promotions');
  if(!res.ok){
    document.getElementById('promotionsTab').innerHTML = `<p style="color:#B23A3A; font-size:14px;">Không tải được khuyến mãi.</p>`;
    return;
  }
  promotions = await res.json();
  promotionsLoaded = true;
  if(!categoriesLoaded){ await loadCategories(); }
  renderPromotionsTab();
}

// MỚI: chuyển đổi qua lại giữa datetime-local (input HTML) và ISO string (lưu server)
function toDatetimeLocal(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromDatetimeLocal(value){
  if(!value) return '';
  return new Date(value).toISOString();
}

function promoStatus(promo){
  const now = new Date();
  if(promo.endedEarly) return { label: 'Đã kết thúc sớm', color: 'var(--ink-soft)' };
  const start = promo.startAt ? new Date(promo.startAt) : null;
  const end = promo.endAt ? new Date(promo.endAt) : null;
  if(start && now < start) return { label: 'Sắp diễn ra', color: '#B26A00' };
  if(end && now > end) return { label: 'Đã kết thúc', color: 'var(--ink-soft)' };
  return { label: 'Đang diễn ra', color: 'var(--sage-deep)' };
}

function renderPromotionsTab(){
  const wrap = document.getElementById('promotionsTab');
  wrap.innerHTML = `
    <div class="add-product-form">
      <button onclick="addPromotion()" style="background:var(--sage-deep); color:#fff; border:none; padding:10px 18px; border-radius:10px; font-weight:600; cursor:pointer;">+ Tạo chương trình khuyến mãi mới</button>
    </div>
    <div id="promotionsList">${renderPromotionCards()}</div>
  `;
}

function renderPromotionCards(){
  if(promotions.length === 0){
    return `<p style="font-size:13px; color:var(--ink-soft);">Chưa có chương trình khuyến mãi nào.</p>`;
  }
  return promotions.map(promo => {
    const st = promoStatus(promo);
    const isOpen = expandedPromoId === promo.id;
    return `
      <div class="add-product-form">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div>
            <b style="font-size:15px;">${escapeHtml(promo.name || '(Chưa đặt tên)')}</b>
            <span style="margin-left:8px; font-size:12px; font-weight:600; color:${st.color};">${st.label}</span>
            <div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">
              ${promo.startAt ? new Date(promo.startAt).toLocaleString('vi-VN') : '?'} → ${promo.endAt ? new Date(promo.endAt).toLocaleString('vi-VN') : '?'}
              · ${promo.items ? promo.items.length : 0} sản phẩm tham gia
              · Hiển thị: ${promo.displayPosition==='hero' ? 'Thay banner chính' : promo.displayPosition==='below-categories' ? 'Ngay dưới danh mục' : 'Không hiển thị trên trang chủ'}
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button onclick="togglePromoEdit('${promo.id}')">${isOpen ? 'Đóng' : 'Sửa'}</button>
            <button class="danger" onclick="deletePromotion('${promo.id}')">Xoá</button>
          </div>
        </div>
        ${isOpen ? renderPromoEditPanel(promo) : ''}
      </div>
    `;
  }).join('');
}

function togglePromoEdit(id){
  expandedPromoId = expandedPromoId === id ? null : id;
  promoProductSearch = '';
  promoProductCategoryFilter = 'all';
  promoExpandedSkuProductId = null;
  promoSelectedProductIds = new Set();
  renderPromotionsTab();
}

function addPromotion(){
  const now = new Date();
  const inOneWeek = new Date(now.getTime() + 7*24*60*60*1000);
  const promo = {
    id: 'promo_' + Date.now(),
    name: 'Chương trình mới',
    description: '',
    startAt: now.toISOString(),
    endAt: inOneWeek.toISOString(),
    endedEarly: false,
    displayPosition: 'none',
    items: []
  };
  promotions.push(promo);
  expandedPromoId = promo.id;
  renderPromotionsTab();
}

async function deletePromotion(id){
  const promo = promotions.find(p => p.id === id);
  if(!confirm(`Xoá hẳn chương trình "${promo ? promo.name : ''}"? Không thể hoàn tác.`)) return;
  promotions = promotions.filter(p => p.id !== id);
  const ok = await savePromotionsToServer();
  if(ok){ if(expandedPromoId===id) expandedPromoId=null; renderPromotionsTab(); }
  else alert('Không xoá được, thử lại.');
}

async function endPromotionEarly(id){
  const promo = promotions.find(p => p.id === id);
  if(!promo) return;
  if(!confirm(`Kết thúc sớm chương trình "${promo.name}" ngay bây giờ?`)) return;
  promo.endedEarly = true;
  const ok = await savePromotionsToServer();
  if(ok){ renderPromotionsTab(); } else { promo.endedEarly = false; alert('Không lưu được, thử lại.'); }
}

async function savePromotionsToServer(){
  const res = await apiFetch('/api/admin/promotions', { method: 'POST', body: JSON.stringify(promotions) });
  return res.ok;
}

async function savePromoAndRefresh(promoId){
  const msgEl = document.getElementById(`promo-save-msg-${promoId}`);
  if(msgEl) msgEl.textContent = 'Đang lưu...';
  const ok = await savePromotionsToServer();
  if(msgEl){
    msgEl.style.color = ok ? 'var(--sage-deep)' : '#B23A3A';
    msgEl.textContent = ok ? 'Đã lưu ✅' : 'Lỗi khi lưu, thử lại.';
  }
}

function findPromo(id){ return promotions.find(p => p.id === id); }

// ---------- Khối chỉnh sửa 1 chương trình ----------
function renderPromoEditPanel(promo){
  const st = promoStatus(promo);
  const canEndEarly = !promo.endedEarly && st.label !== 'Đã kết thúc';
  return `
    <div style="background:#FAFAFC; border:1px solid var(--line); border-radius:12px; padding:14px; margin-top:12px;">
      <div class="form-field">
        <label>Tên chương trình</label>
        <input type="text" value="${escapeHtml(promo.name)}" onchange="updatePromoField('${promo.id}', 'name', this.value)">
      </div>
      <div class="form-field">
        <label>Thông tin chương trình</label>
        <textarea onchange="updatePromoField('${promo.id}', 'description', this.value)" placeholder="Mô tả ngắn về chương trình khuyến mãi...">${escapeHtml(promo.description || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Bắt đầu</label><input type="datetime-local" value="${toDatetimeLocal(promo.startAt)}" onchange="updatePromoDatetime('${promo.id}', 'startAt', this.value)"></div>
        <div class="form-field"><label>Kết thúc</label><input type="datetime-local" value="${toDatetimeLocal(promo.endAt)}" onchange="updatePromoDatetime('${promo.id}', 'endAt', this.value)"></div>
      </div>
      <div class="form-field">
        <label>Vị trí hiển thị trên trang chủ (khách xem)</label>
        <select onchange="updatePromoField('${promo.id}', 'displayPosition', this.value)">
          <option value="none" ${promo.displayPosition==='none'?'selected':''}>Không hiển thị trên trang chủ</option>
          <option value="hero" ${promo.displayPosition==='hero'?'selected':''}>Thay banner chính</option>
          <option value="below-categories" ${promo.displayPosition==='below-categories'?'selected':''}>Ngay dưới danh mục sản phẩm</option>
        </select>
        <p style="font-size:12px; color:var(--ink-soft); margin-top:4px;">Trang chủ sẽ hiện khối này KỂ CẢ TRƯỚC giờ bắt đầu (kèm đếm ngược) - khách xem/thêm giỏ hàng được nhưng vẫn tính giá gốc cho tới đúng giờ, giống hệt Flash Sale.</p>
      </div>
      ${canEndEarly
        ? `<button class="danger" onclick="endPromotionEarly('${promo.id}')">⏹ Kết thúc sớm chương trình này ngay</button>`
        : (promo.endedEarly ? `<p style="font-size:12px; color:var(--ink-soft);">Chương trình đã được kết thúc sớm.</p>` : '')}

      <h4 style="font-size:14px; margin:16px 0 8px;">🪄 Chỉnh sửa hàng loạt cho tất cả sản phẩm trong chương trình</h4>
      <div class="form-row">
        <div class="form-field">
          <label>Kiểu giảm</label>
          <select id="bulk-type-${promo.id}">
            <option value="percent">Giảm %</option>
            <option value="amount">Giảm số tiền (đ)</option>
          </select>
        </div>
        <div class="form-field"><label>Giá trị giảm</label><input type="number" id="bulk-value-${promo.id}" value="0"></div>
        <div class="form-field"><label>Giới hạn/SĐT (để trống = không giới hạn)</label><input type="number" id="bulk-limit-${promo.id}" placeholder="VD: 2"></div>
      </div>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px; margin:6px 0;">
        <input type="checkbox" id="bulk-clear-sku-${promo.id}"> Xoá luôn các mức đã chỉnh riêng theo từng SKU
      </label>
      <button onclick="applyBulkToPromo('${promo.id}')">Áp dụng cho tất cả sản phẩm trong chương trình</button>

      <h4 style="font-size:14px; margin:16px 0 8px;">➕ Thêm sản phẩm vào chương trình</h4>
      <div id="promo-picker-${promo.id}">${renderPromoProductPicker(promo)}</div>

      <h4 style="font-size:14px; margin:16px 0 8px;">🎯 Sản phẩm đang tham gia (${(promo.items||[]).length})</h4>
      ${renderPromoItemsList(promo)}

      <button onclick="savePromoAndRefresh('${promo.id}')" style="background:var(--sage-deep); color:#fff; border:none; padding:10px 18px; border-radius:10px; font-weight:600; cursor:pointer; margin-top:14px;">Lưu chương trình này</button>
      <p id="promo-save-msg-${promo.id}" style="font-size:13px; margin-top:8px; color:var(--sage-deep);"></p>
    </div>
  `;
}

function updatePromoField(promoId, field, value){
  const promo = findPromo(promoId);
  if(!promo) return;
  promo[field] = value;
}
function updatePromoDatetime(promoId, field, value){
  const promo = findPromo(promoId);
  if(!promo) return;
  promo[field] = fromDatetimeLocal(value);
}

function applyBulkToPromo(promoId){
  const promo = findPromo(promoId);
  if(!promo) return;
  const type = document.getElementById(`bulk-type-${promoId}`).value;
  const value = Number(document.getElementById(`bulk-value-${promoId}`).value) || 0;
  const limitRaw = document.getElementById(`bulk-limit-${promoId}`).value;
  const limit = limitRaw === '' ? null : Number(limitRaw);
  const clearSkus = document.getElementById(`bulk-clear-sku-${promoId}`).checked;
  (promo.items || []).forEach(item => {
    item.discountType = type;
    item.discountValue = value;
    item.limitPerPhone = limit;
    if(clearSkus) item.variantOverrides = {};
  });
  renderPromotionsTab();
}

// ---------- Thêm sản phẩm vào chương trình: tìm kiếm + lọc danh mục ----------
function renderPromoProductPicker(promo){
  const q = promoProductSearch.trim().toLowerCase();
  const existingIds = new Set((promo.items || []).map(i => i.productId));
  const matching = products.filter(p =>
    (!q || p.name.toLowerCase().includes(q)) &&
    (promoProductCategoryFilter === 'all' || p.category === promoProductCategoryFilter) &&
    !existingIds.has(p.id)
  );
  // MỚI: hiện TOÀN BỘ kết quả khớp cùng lúc, không phân trang nữa - khung danh sách
  // bên dưới đã tự cuộn sẵn (max-height + overflow-y:auto) nên không giới hạn số lượng
  const rows = matching.map(p => `
    <label style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px dashed var(--line); font-size:13px;">
      <input type="checkbox" ${promoSelectedProductIds.has(p.id) ? 'checked' : ''} onchange="togglePromoSelectProduct('${p.id}', this.checked, '${promo.id}')">
      ${p.image ? `<img src="${p.image}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;">` : `<span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">🎁</span>`}
      <span style="flex:1;">${escapeHtml(p.name)}</span>
      <span style="font-size:11px; color:var(--ink-soft);">${escapeHtml(catLabel(p.category))}</span>
    </label>
  `).join('');
  return `
    <div class="form-row">
      <div class="form-field"><input id="promo-search-${promo.id}" placeholder="Tìm sản phẩm..." value="${escapeHtml(promoProductSearch)}" oninput="updatePromoProductSearch(this.value, '${promo.id}')"></div>
      <div class="form-field">
        <select onchange="promoProductCategoryFilter=this.value; document.getElementById('promo-picker-${promo.id}').innerHTML = renderPromoProductPicker(findPromo('${promo.id}'));">
          <option value="all" ${promoProductCategoryFilter==='all'?'selected':''}>Tất cả danh mục</option>
          ${categories.map(c => `<option value="${c.key}" ${promoProductCategoryFilter===c.key?'selected':''}>${escapeHtml(c.label)}</option>`).join('')}
        </select>
      </div>
    </div>
    <label style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--line); margin:6px 0 4px; font-size:13px; font-weight:600;">
      <input type="checkbox" ${matching.length > 0 && matching.every(p => promoSelectedProductIds.has(p.id)) ? 'checked' : ''} onchange="togglePromoSelectAll(this.checked, '${promo.id}')">
      Chọn tất cả ${matching.length} sản phẩm khớp · Đã chọn: ${promoSelectedProductIds.size}
    </label>
    <div style="max-height:400px; overflow-y:auto;">${rows || '<p style="font-size:13px; color:var(--ink-soft);">Không có sản phẩm nào khớp / tất cả đã tham gia rồi.</p>'}</div>
    <button onclick="addSelectedProductsToPromo('${promo.id}')" style="margin-top:8px;">+ Thêm đã chọn vào chương trình</button>
  `;
}

function updatePromoProductSearch(value, promoId){
  promoProductSearch = value;
  const el = document.getElementById(`promo-picker-${promoId}`);
  if(el) el.innerHTML = renderPromoProductPicker(findPromo(promoId));
  const input = document.getElementById(`promo-search-${promoId}`);
  if(input){ input.focus(); const len = input.value.length; input.setSelectionRange(len, len); }
}

function togglePromoSelectProduct(id, checked, promoId){
  if(checked) promoSelectedProductIds.add(id); else promoSelectedProductIds.delete(id);
  const el = document.getElementById(`promo-picker-${promoId}`);
  if(el) el.innerHTML = renderPromoProductPicker(findPromo(promoId));
}

function togglePromoSelectAll(checked, promoId){
  const promo = findPromo(promoId);
  const q = promoProductSearch.trim().toLowerCase();
  const existingIds = new Set((promo.items || []).map(i => i.productId));
  const matching = products.filter(p =>
    (!q || p.name.toLowerCase().includes(q)) &&
    (promoProductCategoryFilter === 'all' || p.category === promoProductCategoryFilter) &&
    !existingIds.has(p.id)
  ); // MỚI: không còn cắt .slice(0,50) - "Chọn tất cả" giờ áp dụng cho MỌI trang
  matching.forEach(p => { if(checked) promoSelectedProductIds.add(p.id); else promoSelectedProductIds.delete(p.id); });
  const el = document.getElementById(`promo-picker-${promoId}`);
  if(el) el.innerHTML = renderPromoProductPicker(promo);
}

function addSelectedProductsToPromo(promoId){
  const promo = findPromo(promoId);
  if(!promo) return;
  if(promoSelectedProductIds.size === 0){ alert('Chưa chọn sản phẩm nào.'); return; }
  if(!promo.items) promo.items = [];
  const existingIds = new Set(promo.items.map(i => i.productId));
  promoSelectedProductIds.forEach(pid => {
    if(!existingIds.has(pid)){
      promo.items.push({ productId: pid, discountType: 'percent', discountValue: 0, limitPerPhone: null, variantOverrides: {} });
    }
  });
  promoSelectedProductIds = new Set();
  renderPromotionsTab();
}

// ---------- Danh sách sản phẩm đang tham gia + sửa từng SKU ----------
function renderPromoItemsList(promo){
  if(!promo.items || promo.items.length === 0){
    return `<p style="font-size:13px; color:var(--ink-soft);">Chưa có sản phẩm nào tham gia.</p>`;
  }
  return promo.items.map((item, idx) => {
    const p = getProductById(item.productId);
    const isSkuOpen = promoExpandedSkuProductId === item.productId;
    const variants = p ? ((p.variants && p.variants.length) ? p.variants : [{ name: null, price: p.priceMin || 0 }]) : [];
    return `
      <div style="border:1px solid var(--line); border-radius:10px; padding:10px; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          ${p && p.image ? `<img src="${p.image}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;">` : `<span>🎁</span>`}
          <span style="flex:1; font-size:13px; font-weight:600;">${p ? escapeHtml(p.name) : '(Sản phẩm không còn tồn tại)'}</span>
          <button class="danger" onclick="removeItemFromPromo('${promo.id}', ${idx})" style="font-size:11px;">Xoá khỏi CT</button>
        </div>
        <div class="form-row" style="margin-top:8px;">
          <div class="form-field">
            <label>Kiểu giảm</label>
            <select onchange="updatePromoItemField('${promo.id}', ${idx}, 'discountType', this.value)">
              <option value="percent" ${item.discountType==='percent'?'selected':''}>Giảm %</option>
              <option value="amount" ${item.discountType==='amount'?'selected':''}>Giảm số tiền (đ)</option>
            </select>
          </div>
          <div class="form-field"><label>Giá trị giảm</label><input type="number" value="${item.discountValue || 0}" onchange="updatePromoItemField('${promo.id}', ${idx}, 'discountValue', Number(this.value))"></div>
          <div class="form-field"><label>Giới hạn/SĐT (trống = không giới hạn)</label><input type="number" value="${item.limitPerPhone != null ? item.limitPerPhone : ''}" onchange="updatePromoItemLimit('${promo.id}', ${idx}, this.value)"></div>
        </div>
        ${p ? `<button onclick="togglePromoSkuEdit('${item.productId}')" style="margin-top:4px; font-size:12px;">${isSkuOpen ? 'Đóng sửa theo SKU' : `Sửa riêng từng SKU (${variants.length} phân loại)`}</button>` : ''}
        ${isSkuOpen && p ? renderPromoSkuRows(promo, idx, variants) : ''}
      </div>
    `;
  }).join('');
}

function updatePromoItemField(promoId, idx, field, value){
  const promo = findPromo(promoId);
  if(!promo || !promo.items[idx]) return;
  promo.items[idx][field] = value;
}
function updatePromoItemLimit(promoId, idx, value){
  const promo = findPromo(promoId);
  if(!promo || !promo.items[idx]) return;
  promo.items[idx].limitPerPhone = value === '' ? null : Number(value);
}
function removeItemFromPromo(promoId, idx){
  const promo = findPromo(promoId);
  if(!promo) return;
  promo.items.splice(idx, 1);
  renderPromotionsTab();
}
function togglePromoSkuEdit(productId){
  promoExpandedSkuProductId = promoExpandedSkuProductId === productId ? null : productId;
  renderPromotionsTab();
}

function ensurePromoVariantOverride(item, vIdx){
  if(!item.variantOverrides) item.variantOverrides = {};
  if(!item.variantOverrides[vIdx]) item.variantOverrides[vIdx] = {};
  return item.variantOverrides[vIdx];
}

function renderPromoSkuRows(promo, itemIdx, variants){
  const item = promo.items[itemIdx];
  return `
    <div style="background:#fff; border:1px dashed var(--line); border-radius:8px; padding:8px; margin-top:8px;">
      ${variants.map((v, vIdx) => {
        const ov = (item.variantOverrides && item.variantOverrides[vIdx]) || {};
        return `
          <div style="padding:6px 0; border-bottom:1px dashed var(--line); font-size:12px;">
            <b>${escapeHtml(v.name || 'Mặc định')}</b> — giá gốc ${fmt(v.price)}
            <div class="form-row" style="margin-top:4px;">
              <div class="form-field">
                <select onchange="updatePromoSkuOverride('${promo.id}', ${itemIdx}, ${vIdx}, 'discountType', this.value)">
                  <option value="">Dùng theo sản phẩm</option>
                  <option value="percent" ${ov.discountType==='percent'?'selected':''}>Giảm %</option>
                  <option value="amount" ${ov.discountType==='amount'?'selected':''}>Giảm số tiền</option>
                </select>
              </div>
              <div class="form-field"><input type="number" placeholder="Giá trị" value="${ov.discountValue != null ? ov.discountValue : ''}" onchange="updatePromoSkuOverride('${promo.id}', ${itemIdx}, ${vIdx}, 'discountValue', Number(this.value))"></div>
              <div class="form-field"><input type="number" placeholder="Giới hạn/SĐT" value="${ov.limitPerPhone != null ? ov.limitPerPhone : ''}" onchange="updatePromoSkuOverrideLimit('${promo.id}', ${itemIdx}, ${vIdx}, this.value)"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function updatePromoSkuOverride(promoId, itemIdx, vIdx, field, value){
  const promo = findPromo(promoId);
  if(!promo) return;
  const item = promo.items[itemIdx];
  if(field === 'discountType' && value === ''){
    if(item.variantOverrides) delete item.variantOverrides[vIdx];
    return;
  }
  const ov = ensurePromoVariantOverride(item, vIdx);
  ov[field] = value;
}
function updatePromoSkuOverrideLimit(promoId, itemIdx, vIdx, value){
  const promo = findPromo(promoId);
  if(!promo) return;
  const item = promo.items[itemIdx];
  const ov = ensurePromoVariantOverride(item, vIdx);
  ov.limitPerPhone = value === '' ? null : Number(value);
}

// ============================================================
// MỚI: Flash Sale - thiết lập GIỐNG HỆT Khuyến mãi (tạo/sửa/xoá chương trình, thêm/bớt
// sản phẩm tham gia, chỉnh giá giảm + giới hạn mua theo SĐT hàng loạt hoặc từng SKU, hẹn
// giờ, kết thúc sớm, và cùng hiện trên trang chủ TỪ TRƯỚC giờ bắt đầu kèm đếm ngược - khách
// xem/thêm giỏ hàng được nhưng chỉ tính giá gốc cho tới đúng giờ, y hệt Khuyến mãi). Khác
// biệt DUY NHẤT so với Khuyến mãi: khối sản phẩm Flash Sale luôn hiện cố định 6 sản phẩm/dòng
// (laptop/tablet) hoặc 5 sản phẩm/dòng (mobile) thay vì tự co giãn số dòng như Khuyến mãi.
// ============================================================

async function loadFlashSaleSettings(){
  const res = await apiFetch('/api/admin/flash-sales');
  if(!res.ok){
    document.getElementById('flashsaleTab').innerHTML = `<p style="color:#B23A3A; font-size:14px;">Không tải được Flash Sale.</p>`;
    return;
  }
  flashSales = await res.json();
  flashSalesLoaded = true;
  if(!categoriesLoaded){ await loadCategories(); }
  renderFlashSaleTab();
}

function flashSaleStatus(fs){
  const now = new Date();
  if(fs.endedEarly) return { label: 'Đã kết thúc sớm', color: 'var(--ink-soft)' };
  const start = fs.startAt ? new Date(fs.startAt) : null;
  const end = fs.endAt ? new Date(fs.endAt) : null;
  if(start && now < start) return { label: 'Sắp diễn ra', color: '#B26A00' };
  if(end && now > end) return { label: 'Đã kết thúc', color: 'var(--ink-soft)' };
  return { label: 'Đang diễn ra', color: 'var(--sage-deep)' };
}

function renderFlashSaleTab(){
  const wrap = document.getElementById('flashsaleTab');
  wrap.innerHTML = `
    <p style="font-size:13px; color:var(--ink-soft); margin-bottom:10px;">
      Cách hiển thị giống hệt Khuyến mãi (hiện trên trang chủ kèm đếm ngược từ TRƯỚC giờ bắt đầu,
      khách xem/thêm giỏ hàng được nhưng vẫn tính giá gốc cho tới đúng giờ). Khác biệt duy nhất:
      khối Flash Sale luôn hiện cố định 6 sản phẩm/dòng (laptop/tablet) và 5 sản phẩm/dòng (mobile).
    </p>
    <div class="add-product-form">
      <button onclick="addFlashSale()" style="background:var(--sage-deep); color:#fff; border:none; padding:10px 18px; border-radius:10px; font-weight:600; cursor:pointer;">+ Tạo chương trình Flash Sale mới</button>
    </div>
    <div id="flashSalesList">${renderFlashSaleCards()}</div>
  `;
}

function renderFlashSaleCards(){
  if(flashSales.length === 0){
    return `<p style="font-size:13px; color:var(--ink-soft);">Chưa có chương trình Flash Sale nào.</p>`;
  }
  return flashSales.map(fs => {
    const st = flashSaleStatus(fs);
    const isOpen = expandedFlashSaleId === fs.id;
    return `
      <div class="add-product-form">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div>
            <b style="font-size:15px;">${escapeHtml(fs.name || '(Chưa đặt tên)')}</b>
            <span style="margin-left:8px; font-size:12px; font-weight:600; color:${st.color};">${st.label}</span>
            <div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">
              ${fs.startAt ? new Date(fs.startAt).toLocaleString('vi-VN') : '?'} → ${fs.endAt ? new Date(fs.endAt).toLocaleString('vi-VN') : '?'}
              · ${fs.items ? fs.items.length : 0} sản phẩm tham gia
              · Hiển thị: ${fs.displayPosition==='hero' ? 'Thay banner chính' : fs.displayPosition==='below-categories' ? 'Ngay dưới danh mục' : 'Không hiển thị trên trang chủ'}
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button onclick="toggleFlashSaleEdit('${fs.id}')">${isOpen ? 'Đóng' : 'Sửa'}</button>
            <button class="danger" onclick="deleteFlashSale('${fs.id}')">Xoá</button>
          </div>
        </div>
        ${isOpen ? renderFlashSaleEditPanel(fs) : ''}
      </div>
    `;
  }).join('');
}

function toggleFlashSaleEdit(id){
  expandedFlashSaleId = expandedFlashSaleId === id ? null : id;
  flashSaleProductSearch = '';
  flashSaleProductCategoryFilter = 'all';
  flashSaleExpandedSkuProductId = null;
  flashSaleSelectedProductIds = new Set();
  renderFlashSaleTab();
}

function addFlashSale(){
  const now = new Date();
  const in2Hours = new Date(now.getTime() + 2*60*60*1000);
  const fs = {
    id: 'flashsale_' + Date.now(),
    name: 'Flash Sale mới',
    description: '',
    startAt: now.toISOString(),
    endAt: in2Hours.toISOString(),
    endedEarly: false,
    displayPosition: 'none',
    items: []
  };
  flashSales.push(fs);
  expandedFlashSaleId = fs.id;
  renderFlashSaleTab();
}

async function deleteFlashSale(id){
  const fs = flashSales.find(f => f.id === id);
  if(!confirm(`Xoá hẳn chương trình Flash Sale "${fs ? fs.name : ''}"? Không thể hoàn tác.`)) return;
  flashSales = flashSales.filter(f => f.id !== id);
  const ok = await saveFlashSalesToServer();
  if(ok){ if(expandedFlashSaleId===id) expandedFlashSaleId=null; renderFlashSaleTab(); }
}

async function endFlashSaleEarly(id){
  const fs = flashSales.find(f => f.id === id);
  if(!fs) return;
  if(!confirm(`Kết thúc sớm Flash Sale "${fs.name}" ngay bây giờ?`)) return;
  fs.endedEarly = true;
  const ok = await saveFlashSalesToServer();
  if(ok){ renderFlashSaleTab(); } else { fs.endedEarly = false; alert('Không lưu được, thử lại.'); }
}

async function saveFlashSalesToServer(){
  const res = await apiFetch('/api/admin/flash-sales', { method: 'POST', body: JSON.stringify(flashSales) });
  return res.ok;
}

async function saveFlashSaleAndRefresh(flashSaleId){
  const msgEl = document.getElementById(`flashsale-save-msg-${flashSaleId}`);
  if(msgEl) msgEl.textContent = 'Đang lưu...';
  const ok = await saveFlashSalesToServer();
  if(msgEl) msgEl.textContent = ok ? 'Đã lưu ✅' : 'Lỗi khi lưu, thử lại.';
}

function findFlashSale(id){ return flashSales.find(f => f.id === id); }

function renderFlashSaleEditPanel(fs){
  const st = flashSaleStatus(fs);
  const canEndEarly = !fs.endedEarly && st.label !== 'Đã kết thúc';
  return `
    <div style="background:#FAFAFC; border:1px solid var(--line); border-radius:12px; padding:14px; margin-top:12px;">
      <div class="form-field">
        <label>Tên chương trình</label>
        <input type="text" value="${escapeHtml(fs.name)}" onchange="updateFlashSaleField('${fs.id}', 'name', this.value)">
      </div>
      <div class="form-field">
        <label>Thông tin chương trình</label>
        <textarea onchange="updateFlashSaleField('${fs.id}', 'description', this.value)" placeholder="Mô tả ngắn về Flash Sale...">${escapeHtml(fs.description || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Bắt đầu</label><input type="datetime-local" value="${toDatetimeLocal(fs.startAt)}" onchange="updateFlashSaleDatetime('${fs.id}', 'startAt', this.value)"></div>
        <div class="form-field"><label>Kết thúc</label><input type="datetime-local" value="${toDatetimeLocal(fs.endAt)}" onchange="updateFlashSaleDatetime('${fs.id}', 'endAt', this.value)"></div>
      </div>
      <div class="form-field">
        <label>Vị trí hiển thị trên trang chủ (khách xem)</label>
        <select onchange="updateFlashSaleField('${fs.id}', 'displayPosition', this.value)">
          <option value="none" ${fs.displayPosition==='none'?'selected':''}>Không hiển thị trên trang chủ</option>
          <option value="hero" ${fs.displayPosition==='hero'?'selected':''}>Thay banner chính</option>
          <option value="below-categories" ${fs.displayPosition==='below-categories'?'selected':''}>Ngay dưới danh mục sản phẩm</option>
        </select>
        <p style="font-size:12px; color:var(--ink-soft); margin-top:4px;">Trang chủ sẽ hiện khối này KỂ CẢ TRƯỚC giờ bắt đầu (kèm đếm ngược) - khách xem/thêm giỏ hàng được nhưng vẫn tính giá gốc cho tới đúng giờ.</p>
      </div>
      ${canEndEarly
        ? `<button class="danger" onclick="endFlashSaleEarly('${fs.id}')">⏹ Kết thúc sớm chương trình này ngay</button>`
        : (fs.endedEarly ? `<p style="font-size:12px; color:var(--ink-soft);">Chương trình đã được kết thúc sớm.</p>` : '')}

      <h4 style="font-size:14px; margin:16px 0 8px;">🪄 Chỉnh sửa hàng loạt cho tất cả sản phẩm trong chương trình</h4>
      <div class="form-row">
        <div class="form-field">
          <label>Kiểu giảm</label>
          <select id="bulk-fs-type-${fs.id}">
            <option value="percent">Giảm %</option>
            <option value="amount">Giảm số tiền (đ)</option>
          </select>
        </div>
        <div class="form-field"><label>Giá trị giảm</label><input type="number" id="bulk-fs-value-${fs.id}" value="0"></div>
        <div class="form-field"><label>Giới hạn/SĐT (để trống = không giới hạn)</label><input type="number" id="bulk-fs-limit-${fs.id}" placeholder="VD: 2"></div>
      </div>
      <label style="display:flex; align-items:center; gap:6px; font-size:13px; margin:6px 0;">
        <input type="checkbox" id="bulk-fs-clear-sku-${fs.id}"> Xoá luôn các mức đã chỉnh riêng theo từng SKU
      </label>
      <button onclick="applyBulkToFlashSale('${fs.id}')">Áp dụng cho tất cả sản phẩm trong chương trình</button>

      <h4 style="font-size:14px; margin:16px 0 8px;">➕ Thêm sản phẩm vào chương trình</h4>
      <div id="flashsale-picker-${fs.id}">${renderFlashSaleProductPicker(fs)}</div>

      <h4 style="font-size:14px; margin:16px 0 8px;">🎯 Sản phẩm đang tham gia (${(fs.items||[]).length})</h4>
      ${renderFlashSaleItemsList(fs)}

      <button onclick="saveFlashSaleAndRefresh('${fs.id}')" style="background:var(--sage-deep); color:#fff; border:none; padding:10px 18px; border-radius:10px; font-weight:600; cursor:pointer; margin-top:14px;">Lưu chương trình này</button>
      <p id="flashsale-save-msg-${fs.id}" style="font-size:13px; margin-top:8px; color:var(--sage-deep);"></p>
    </div>
  `;
}

function updateFlashSaleField(flashSaleId, field, value){
  const fs = findFlashSale(flashSaleId);
  if(!fs) return;
  fs[field] = value;
}
function updateFlashSaleDatetime(flashSaleId, field, value){
  const fs = findFlashSale(flashSaleId);
  if(!fs) return;
  fs[field] = fromDatetimeLocal(value);
}

function applyBulkToFlashSale(flashSaleId){
  const fs = findFlashSale(flashSaleId);
  if(!fs) return;
  const type = document.getElementById(`bulk-fs-type-${flashSaleId}`).value;
  const value = Number(document.getElementById(`bulk-fs-value-${flashSaleId}`).value) || 0;
  const limitRaw = document.getElementById(`bulk-fs-limit-${flashSaleId}`).value;
  const limit = limitRaw === '' ? null : Number(limitRaw);
  const clearSkus = document.getElementById(`bulk-fs-clear-sku-${flashSaleId}`).checked;
  (fs.items || []).forEach(item => {
    item.discountType = type;
    item.discountValue = value;
    item.limitPerPhone = limit;
    if(clearSkus) item.variantOverrides = {};
  });
  renderFlashSaleTab();
}

// ---------- Thêm sản phẩm vào chương trình: tìm kiếm + lọc danh mục ----------
function renderFlashSaleProductPicker(fs){
  const q = flashSaleProductSearch.trim().toLowerCase();
  const existingIds = new Set((fs.items || []).map(i => i.productId));
  const matching = products.filter(p =>
    !existingIds.has(p.id) &&
    (flashSaleProductCategoryFilter === 'all' || p.category === flashSaleProductCategoryFilter) &&
    (q === '' || p.name.toLowerCase().includes(q))
  ).slice(0, 60);
  return `
    <div class="form-row">
      <div class="form-field"><input id="flashsale-search-${fs.id}" placeholder="Tìm sản phẩm..." value="${escapeHtml(flashSaleProductSearch)}" oninput="updateFlashSaleProductSearch(this.value, '${fs.id}')"></div>
      <div class="form-field">
        <select onchange="flashSaleProductCategoryFilter=this.value; document.getElementById('flashsale-picker-${fs.id}').innerHTML = renderFlashSaleProductPicker(findFlashSale('${fs.id}'));">
          <option value="all" ${flashSaleProductCategoryFilter==='all'?'selected':''}>Tất cả danh mục</option>
          ${categories.map(c => `<option value="${c.key}" ${flashSaleProductCategoryFilter===c.key?'selected':''}>${escapeHtml(c.label)}</option>`).join('')}
        </select>
      </div>
    </div>
    <label style="display:flex; align-items:center; gap:6px; font-size:13px; margin:6px 0;">
      <input type="checkbox" ${matching.length > 0 && matching.every(p => flashSaleSelectedProductIds.has(p.id)) ? 'checked' : ''} onchange="toggleFlashSaleSelectAll(this.checked, '${fs.id}')">
      Chọn tất cả ${matching.length} sản phẩm khớp · Đã chọn: ${flashSaleSelectedProductIds.size}
    </label>
    <div style="max-height:220px; overflow-y:auto; border:1px solid var(--line); border-radius:8px; padding:6px;">
      ${matching.map(p => `
        <label style="display:flex; align-items:center; gap:8px; padding:4px 2px; font-size:13px;">
          <input type="checkbox" ${flashSaleSelectedProductIds.has(p.id) ? 'checked' : ''} onchange="toggleFlashSaleSelectProduct('${p.id}', this.checked, '${fs.id}')">
          ${p.image ? `<img src="${p.image}" style="width:28px;height:28px;border-radius:5px;object-fit:cover;">` : ''}
          <span>${escapeHtml(p.name)}</span>
        </label>
      `).join('') || '<p style="font-size:12px; color:var(--ink-soft); padding:4px;">Không tìm thấy sản phẩm khớp.</p>'}
    </div>
    <button onclick="addSelectedProductsToFlashSale('${fs.id}')" style="margin-top:8px;">+ Thêm đã chọn vào chương trình</button>
  `;
}

function updateFlashSaleProductSearch(value, flashSaleId){
  flashSaleProductSearch = value;
  const el = document.getElementById(`flashsale-picker-${flashSaleId}`);
  if(el) el.innerHTML = renderFlashSaleProductPicker(findFlashSale(flashSaleId));
  const input = document.getElementById(`flashsale-search-${flashSaleId}`);
  if(input){ input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}
function toggleFlashSaleSelectProduct(id, checked, flashSaleId){
  if(checked) flashSaleSelectedProductIds.add(id); else flashSaleSelectedProductIds.delete(id);
  const el = document.getElementById(`flashsale-picker-${flashSaleId}`);
  if(el) el.innerHTML = renderFlashSaleProductPicker(findFlashSale(flashSaleId));
}
function toggleFlashSaleSelectAll(checked, flashSaleId){
  const fs = findFlashSale(flashSaleId);
  const q = flashSaleProductSearch.trim().toLowerCase();
  const existingIds = new Set((fs.items || []).map(i => i.productId));
  const matching = products.filter(p =>
    !existingIds.has(p.id) &&
    (flashSaleProductCategoryFilter === 'all' || p.category === flashSaleProductCategoryFilter) &&
    (q === '' || p.name.toLowerCase().includes(q))
  ).slice(0, 60);
  matching.forEach(p => { if(checked) flashSaleSelectedProductIds.add(p.id); else flashSaleSelectedProductIds.delete(p.id); });
  const el = document.getElementById(`flashsale-picker-${flashSaleId}`);
  if(el) el.innerHTML = renderFlashSaleProductPicker(fs);
}

function addSelectedProductsToFlashSale(flashSaleId){
  const fs = findFlashSale(flashSaleId);
  if(!fs) return;
  if(flashSaleSelectedProductIds.size === 0){ alert('Chưa chọn sản phẩm nào.'); return; }
  if(!fs.items) fs.items = [];
  const existingIds = new Set(fs.items.map(i => i.productId));
  flashSaleSelectedProductIds.forEach(pid => {
    if(!existingIds.has(pid)){
      fs.items.push({ productId: pid, discountType: 'percent', discountValue: 0, limitPerPhone: null, variantOverrides: {} });
    }
  });
  flashSaleSelectedProductIds = new Set();
  renderFlashSaleTab();
}

function renderFlashSaleItemsList(fs){
  if(!fs.items || fs.items.length === 0){
    return `<p style="font-size:13px; color:var(--ink-soft);">Chưa có sản phẩm nào tham gia.</p>`;
  }
  return fs.items.map((item, idx) => {
    const p = getProductById(item.productId);
    const isSkuOpen = flashSaleExpandedSkuProductId === item.productId;
    const variants = p ? ((p.variants && p.variants.length) ? p.variants : [{ name: null, price: p.priceMin || 0 }]) : [];
    return `
      <div style="border:1px solid var(--line); border-radius:10px; padding:10px; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          ${p && p.image ? `<img src="${p.image}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;">` : `<span>⚡</span>`}
          <span style="flex:1; font-size:13px; font-weight:600;">${p ? escapeHtml(p.name) : '(Sản phẩm không còn tồn tại)'}</span>
          <button class="danger" onclick="removeItemFromFlashSale('${fs.id}', ${idx})" style="font-size:11px;">Xoá khỏi CT</button>
        </div>
        <div class="form-row" style="margin-top:8px;">
          <div class="form-field">
            <label>Kiểu giảm</label>
            <select onchange="updateFlashSaleItemField('${fs.id}', ${idx}, 'discountType', this.value)">
              <option value="percent" ${item.discountType==='percent'?'selected':''}>Giảm %</option>
              <option value="amount" ${item.discountType==='amount'?'selected':''}>Giảm số tiền (đ)</option>
            </select>
          </div>
          <div class="form-field"><label>Giá trị giảm</label><input type="number" value="${item.discountValue || 0}" onchange="updateFlashSaleItemField('${fs.id}', ${idx}, 'discountValue', Number(this.value))"></div>
          <div class="form-field"><label>Giới hạn/SĐT (trống = không giới hạn)</label><input type="number" value="${item.limitPerPhone != null ? item.limitPerPhone : ''}" onchange="updateFlashSaleItemLimit('${fs.id}', ${idx}, this.value)"></div>
        </div>
        ${p ? `<button onclick="toggleFlashSaleSkuEdit('${item.productId}')" style="margin-top:4px; font-size:12px;">${isSkuOpen ? 'Đóng sửa theo SKU' : `Sửa riêng từng SKU (${variants.length} phân loại)`}</button>` : ''}
        ${isSkuOpen && p ? renderFlashSaleSkuRows(fs, idx, variants) : ''}
      </div>
    `;
  }).join('');
}

function updateFlashSaleItemField(flashSaleId, idx, field, value){
  const fs = findFlashSale(flashSaleId);
  if(!fs || !fs.items[idx]) return;
  fs.items[idx][field] = value;
}
function updateFlashSaleItemLimit(flashSaleId, idx, value){
  const fs = findFlashSale(flashSaleId);
  if(!fs || !fs.items[idx]) return;
  fs.items[idx].limitPerPhone = value === '' ? null : Number(value);
}
function removeItemFromFlashSale(flashSaleId, idx){
  const fs = findFlashSale(flashSaleId);
  if(!fs) return;
  fs.items.splice(idx, 1);
  renderFlashSaleTab();
}
function toggleFlashSaleSkuEdit(productId){
  flashSaleExpandedSkuProductId = flashSaleExpandedSkuProductId === productId ? null : productId;
  renderFlashSaleTab();
}

function ensureFlashSaleVariantOverride(item, vIdx){
  if(!item.variantOverrides) item.variantOverrides = {};
  if(!item.variantOverrides[vIdx]) item.variantOverrides[vIdx] = {};
  return item.variantOverrides[vIdx];
}

function renderFlashSaleSkuRows(fs, itemIdx, variants){
  const item = fs.items[itemIdx];
  return `
    <div style="background:#fff; border:1px dashed var(--line); border-radius:8px; padding:8px; margin-top:8px;">
      ${variants.map((v, vIdx) => {
        const ov = (item.variantOverrides && item.variantOverrides[vIdx]) || {};
        return `
          <div style="padding:6px 0; border-bottom:1px dashed var(--line); font-size:12px;">
            <b>${escapeHtml(v.name || 'Mặc định')}</b> — giá gốc ${fmt(v.price)}
            <div class="form-row" style="margin-top:4px;">
              <div class="form-field">
                <select onchange="updateFlashSaleSkuOverride('${fs.id}', ${itemIdx}, ${vIdx}, 'discountType', this.value)">
                  <option value="">Dùng theo sản phẩm</option>
                  <option value="percent" ${ov.discountType==='percent'?'selected':''}>Giảm %</option>
                  <option value="amount" ${ov.discountType==='amount'?'selected':''}>Giảm số tiền</option>
                </select>
              </div>
              <div class="form-field"><input type="number" placeholder="Giá trị" value="${ov.discountValue != null ? ov.discountValue : ''}" onchange="updateFlashSaleSkuOverride('${fs.id}', ${itemIdx}, ${vIdx}, 'discountValue', Number(this.value))"></div>
              <div class="form-field"><input type="number" placeholder="Giới hạn/SĐT" value="${ov.limitPerPhone != null ? ov.limitPerPhone : ''}" onchange="updateFlashSaleSkuOverrideLimit('${fs.id}', ${itemIdx}, ${vIdx}, this.value)"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function updateFlashSaleSkuOverride(flashSaleId, itemIdx, vIdx, field, value){
  const fs = findFlashSale(flashSaleId);
  if(!fs) return;
  const item = fs.items[itemIdx];
  if(field === 'discountType' && value === ''){
    if(item.variantOverrides) delete item.variantOverrides[vIdx];
    return;
  }
  const ov = ensureFlashSaleVariantOverride(item, vIdx);
  ov[field] = value;
}
function updateFlashSaleSkuOverrideLimit(flashSaleId, itemIdx, vIdx, value){
  const fs = findFlashSale(flashSaleId);
  if(!fs) return;
  const item = fs.items[itemIdx];
  const ov = ensureFlashSaleVariantOverride(item, vIdx);
  ov.limitPerPhone = value === '' ? null : Number(value);
}

// ---------- MỚI: Chính sách (điều khoản, vận chuyển, đổi trả, bảo mật, thanh toán) ----------
// Các trang này bắt buộc phải có nội dung đầy đủ khi thông báo website với Bộ Công Thương.
const POLICY_KEYS = [
  { key: 'about',    label: 'ℹ️ Giới thiệu / Thông tin thương nhân' },
  { key: 'terms',    label: '📜 Điều khoản sử dụng' },
  { key: 'shipping', label: '🚚 Vận chuyển - giao nhận' },
  { key: 'returns',  label: '↩️ Đổi trả - hoàn tiền' },
  { key: 'privacy',  label: '🔒 Bảo mật thông tin' },
  { key: 'payment',  label: '💳 Phương thức thanh toán' },
  { key: 'contact',  label: '📞 Liên hệ' },
];

async function loadPoliciesSettings(){
  const res = await apiFetch('/api/admin/policies');
  if(!res.ok){
    document.getElementById('policiesTab').innerHTML = `<p style="color:#B23A3A; font-size:14px;">Không tải được nội dung chính sách.</p>`;
    return;
  }
  policiesContent = await res.json();
  policiesLoaded = true;
  renderPoliciesTab();
}

function renderPoliciesTab(){
  const wrap = document.getElementById('policiesTab');
  wrap.innerHTML = `
    <p style="font-size:12px; color:var(--ink-soft); margin-bottom:14px;">Nội dung dưới đây hiển thị công khai ở cuối trang chủ và tại <code>/policy.html</code> - cần điền đầy đủ, đúng thực tế shop trước khi nộp hồ sơ thông báo với Bộ Công Thương.</p>
    ${POLICY_KEYS.map(p => `
      <div class="add-product-form">
        <h3>${p.label}</h3>
        <div class="form-field">
          <label>Tiêu đề hiển thị</label>
          <input type="text" value="${escapeHtml(policiesContent[p.key].title)}" oninput="policiesContent['${p.key}'].title=this.value">
        </div>
        <div class="form-field">
          <label>Nội dung</label>
          <textarea rows="8" style="width:100%; font-family:inherit; font-size:14px; padding:10px; border-radius:8px; border:1px solid var(--line);" oninput="policiesContent['${p.key}'].content=this.value">${escapeHtml(policiesContent[p.key].content)}</textarea>
        </div>
      </div>
    `).join('')}
    <button onclick="savePoliciesContent()" style="background:var(--sage-deep); color:#fff; border:none; padding:10px 18px; border-radius:10px; font-weight:600; cursor:pointer;">Lưu nội dung chính sách</button>
    <p id="policiesSaveMsg" style="font-size:13px; margin-top:10px; color:var(--sage-deep);"></p>
  `;
}

async function savePoliciesContent(){
  const res = await apiFetch('/api/admin/policies', {
    method: 'POST',
    body: JSON.stringify(policiesContent)
  });
  const msgEl = document.getElementById('policiesSaveMsg');
  if(res.ok){ msgEl.textContent = 'Đã lưu nội dung chính sách ✅'; }
  else { msgEl.textContent = 'Lỗi khi lưu, thử lại.'; }
}

// ---------- Khởi động ----------
if(adminKey){
  tryLoadOrders().then(ok => {
    if(ok){
      document.getElementById('loginView').style.display = 'none';
      document.getElementById('adminView').style.display = 'block';
      loadProducts();
    }
  });
}

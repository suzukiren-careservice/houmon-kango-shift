// ===========================
// 営業日報 - ロジック（Supabase対応）
// ===========================

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let reports = [];
let editingId = null;
let currentDetailId = null;

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', async () => {
  initDate();
  restoreLastStaff();
  await loadData();
  updateSidebarCount();
});

async function loadData() {
  const { data, error } = await db
    .from('sales_reports')
    .select('*')
    .order('visit_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) { showToast('データ読み込みエラー', 'error'); return; }
  reports = data || [];
  updateSidebarCount();
}

function initDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  document.getElementById('visitDate').value = `${y}-${m}-${d}`;
}

function restoreLastStaff() {
  const last = localStorage.getItem('eigyo_last_staff');
  if (last) document.getElementById('staff').value = last;
}

// ===== ビュー切替 =====
function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${viewName}`).classList.add('active');
  document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

  if (viewName === 'list') renderList();
}

// ===== フォーム保存 =====
async function saveReport(event) {
  event.preventDefault();

  const record = {
    visit_date:      document.getElementById('visitDate').value,
    staff:            document.getElementById('staff').value,
    client_name:      document.getElementById('clientName').value,
    contact_person:   document.getElementById('contactPerson').value,
    content:          document.getElementById('content').value,
    items_given:      document.getElementById('itemsGiven').value
  };

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;

  let error;
  if (editingId) {
    ({ error } = await db.from('sales_reports').update(record).eq('id', editingId));
  } else {
    ({ error } = await db.from('sales_reports').insert(record));
  }

  submitBtn.disabled = false;

  if (error) {
    showToast('保存に失敗しました', 'error');
    return;
  }

  localStorage.setItem('eigyo_last_staff', record.staff);
  showToast(editingId ? '更新しました' : '保存しました', 'success');
  const wasEditing = !!editingId;
  cancelEdit();
  await loadData();
  if (wasEditing) showView('list');
}

function resetForm() {
  document.getElementById('reportForm').reset();
  initDate();
  restoreLastStaff();
}

function cancelEdit() {
  editingId = null;
  document.getElementById('editModeBanner').style.display = 'none';
  document.getElementById('submitBtn').textContent = '保存する';
  resetForm();
}

// ===== 一覧表示 =====
function renderList() {
  const container = document.getElementById('reportListContainer');
  const keyword = (document.getElementById('searchInput').value || '').trim().toLowerCase();

  let filtered = reports;
  if (keyword) {
    filtered = reports.filter(r =>
      (r.client_name || '').toLowerCase().includes(keyword) ||
      (r.contact_person || '').toLowerCase().includes(keyword) ||
      (r.staff || '').toLowerCase().includes(keyword) ||
      (r.content || '').toLowerCase().includes(keyword) ||
      (r.items_given || '').toLowerCase().includes(keyword)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">記録がありません</div>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(r => `
    <div class="report-card" onclick="openDetailModal('${r.id}')">
      <div class="report-top-row">
        <div class="report-client">${escapeHtml(r.client_name || '（営業先未入力）')}</div>
        <div class="report-date">${formatDate(r.visit_date)}</div>
      </div>
      <div class="report-meta">
        <span class="badge badge-blue">👤 ${escapeHtml(r.staff || '-')}</span>
        ${r.contact_person ? `<span class="badge badge-gray">先方: ${escapeHtml(r.contact_person)}</span>` : ''}
      </div>
      ${r.content ? `<div class="report-content-preview">${escapeHtml(r.content)}</div>` : ''}
    </div>
  `).join('');
}

// ===== 詳細モーダル =====
function openDetailModal(id) {
  const r = reports.find(x => x.id === id);
  if (!r) return;
  currentDetailId = id;

  document.getElementById('detailModalTitle').textContent = r.client_name || '訪問記録';
  document.getElementById('detailVisitDate').textContent = formatDate(r.visit_date);
  document.getElementById('detailStaff').textContent = r.staff || '-';
  document.getElementById('detailClientName').textContent = r.client_name || '-';
  document.getElementById('detailContactPerson').textContent = r.contact_person || '-';
  document.getElementById('detailContent').textContent = r.content || '-';
  document.getElementById('detailItemsGiven').textContent = r.items_given || '-';

  document.getElementById('detailModal').classList.add('open');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('open');
  currentDetailId = null;
}

function editReport() {
  const r = reports.find(x => x.id === currentDetailId);
  if (!r) return;

  editingId = r.id;
  document.getElementById('visitDate').value = r.visit_date || '';
  document.getElementById('staff').value = r.staff || '';
  document.getElementById('clientName').value = r.client_name || '';
  document.getElementById('contactPerson').value = r.contact_person || '';
  document.getElementById('content').value = r.content || '';
  document.getElementById('itemsGiven').value = r.items_given || '';

  document.getElementById('editModeBanner').style.display = 'flex';
  document.getElementById('editModeName').textContent = r.client_name || '';
  document.getElementById('submitBtn').textContent = '更新する';

  closeDetailModal();
  showView('form');
}

async function deleteReport() {
  if (!currentDetailId) return;
  if (!confirm('この記録を削除しますか？')) return;

  const { error } = await db.from('sales_reports').delete().eq('id', currentDetailId);
  if (error) { showToast('削除に失敗しました', 'error'); return; }

  showToast('削除しました', 'success');
  closeDetailModal();
  await loadData();
  renderList();
}

// ===== ユーティリティ =====
function updateSidebarCount() {
  document.getElementById('sidebarCount').textContent = `${reports.length} 件の記録`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type || ''}`;
  setTimeout(() => { toast.className = 'toast'; }, 2600);
}

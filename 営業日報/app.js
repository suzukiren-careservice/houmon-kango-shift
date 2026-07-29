// ===========================
// 営業日報 - ロジック（Supabase対応）
// ===========================

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let reports = [];
let editingId = null;
let currentDetailId = null;

const IMPRESSION_LABELS = {
  good_more: { label: '🔥 もっと通うべき',        short: '🔥 もっと通うべき',  color: '#ed8936' },
  good:      { label: '😊 良い感触',              short: '😊 良い感触',        color: '#48bb78' },
  neutral:   { label: '😐 普通・様子見',          short: '😐 普通',            color: '#a0aec0' },
  bad:       { label: '😕 反応薄い',              short: '😕 反応薄い',        color: '#4299e1' },
  stop:      { label: '🚫 もう行かない方が良い',  short: '🚫 行かない方が良い', color: '#e53e3e' }
};
const IMPRESSION_ORDER = ['good_more', 'good', 'neutral', 'bad', 'stop'];
const FOLLOW_UP_DAYS = 30;

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

function getImpression() {
  const el = document.querySelector('input[name="impression"]:checked');
  return el ? el.value : 'neutral';
}

function setImpression(value) {
  const el = document.querySelector(`input[name="impression"][value="${value}"]`);
  if (el) el.checked = true;
}

// ===== ビュー切替 =====
function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${viewName}`).classList.add('active');
  document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

  if (viewName === 'list') renderList();
  if (viewName === 'stats') renderStats();
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
    items_given:      document.getElementById('itemsGiven').value,
    impression:       getImpression()
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
        ${impressionBadge(r.impression)}
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
  document.getElementById('detailImpression').innerHTML = impressionBadge(r.impression);

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
  setImpression(r.impression || 'neutral');

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

// ===== 実績 =====
function renderStats() {
  const now = new Date();
  const totalVisits = reports.length;

  // 営業先ごとに集計（訪問回数・最終訪問日・最新の感触・最新の先方担当者）
  const clientMap = new Map();
  reports.forEach(r => {
    const key = r.client_name || '（営業先未入力）';
    if (!clientMap.has(key)) {
      clientMap.set(key, { count: 0, lastDate: null, lastImpression: 'neutral', lastContact: '' });
    }
    const c = clientMap.get(key);
    c.count++;
    if (!c.lastDate || r.visit_date > c.lastDate) {
      c.lastDate = r.visit_date;
      c.lastImpression = r.impression;
      c.lastContact = r.contact_person;
    }
  });
  const ranking = Array.from(clientMap.entries()).sort((a, b) => b[1].count - a[1].count);

  const followUp = ranking
    .filter(([, c]) => isGoodImpression(c.lastImpression) && daysSince(c.lastDate) >= FOLLOW_UP_DAYS)
    .sort((a, b) => daysSince(b[1].lastDate) - daysSince(a[1].lastDate));

  const thisMonthVisits = reports.filter(r => {
    if (!r.visit_date) return false;
    const d = new Date(r.visit_date + 'T00:00:00');
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  document.getElementById('statCards').innerHTML = [
    statCard(totalVisits, '総訪問回数'),
    statCard(clientMap.size, '営業先数'),
    statCard(thisMonthVisits, '今月の訪問数'),
    statCard(followUp.length, '要フォロー')
  ].join('');

  renderImpressionBreakdown();
  renderFollowUpList(followUp);
  renderClientRanking(ranking);
  renderGoodContacts();
}

function statCard(value, label) {
  return `<div class="stat-card"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}

function isGoodImpression(key) {
  return key === 'good_more' || key === 'good';
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr + 'T00:00:00');
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function impressionBadge(key) {
  const info = IMPRESSION_LABELS[key] || IMPRESSION_LABELS.neutral;
  return `<span class="imp-badge imp-${key}">${info.short}</span>`;
}

function renderImpressionBreakdown() {
  const container = document.getElementById('impressionBreakdown');
  const total = reports.length;
  if (total === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">データがありません</div></div>`;
    return;
  }
  const counts = {};
  reports.forEach(r => { counts[r.impression] = (counts[r.impression] || 0) + 1; });

  container.innerHTML = IMPRESSION_ORDER.map(key => {
    const c = counts[key] || 0;
    const pct = Math.round((c / total) * 100);
    const info = IMPRESSION_LABELS[key];
    return `
      <div class="breakdown-row">
        <span>${info.label}</span>
        <div class="breakdown-bar-track"><div class="breakdown-bar-fill" style="width:${pct}%; background:${info.color}"></div></div>
        <span class="breakdown-count">${c}</span>
      </div>`;
  }).join('');
}

function renderFollowUpList(followUp) {
  const container = document.getElementById('followUpList');
  if (followUp.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:20px 0"><div class="empty-state-text">現在フォロー推奨の先はありません</div></div>`;
    return;
  }
  container.innerHTML = followUp.map(([name, c]) => `
    <div class="follow-up-card">
      <div><span class="fu-client">${escapeHtml(name)}</span> ${impressionBadge(c.lastImpression)}</div>
      <div class="fu-days">最終訪問から ${daysSince(c.lastDate)} 日</div>
    </div>
  `).join('');
}

function renderClientRanking(ranking) {
  const tbody = document.querySelector('#clientRankingTable tbody');
  if (ranking.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#a0aec0;padding:24px">データがありません</td></tr>`;
    return;
  }
  tbody.innerHTML = ranking.map(([name, c]) => `
    <tr>
      <td>${escapeHtml(name)}</td>
      <td>${c.count}</td>
      <td>${formatDate(c.lastDate)}</td>
      <td>${impressionBadge(c.lastImpression)}</td>
      <td>${escapeHtml(c.lastContact || '-')}</td>
    </tr>
  `).join('');
}

function renderGoodContacts() {
  const tbody = document.querySelector('#goodContactsTable tbody');
  const contactMap = new Map();
  reports.forEach(r => {
    if (!r.contact_person || !isGoodImpression(r.impression)) return;
    const key = r.contact_person + '||' + r.client_name;
    if (!contactMap.has(key)) {
      contactMap.set(key, { contact: r.contact_person, client: r.client_name, count: 0, lastDate: null, lastImpression: r.impression });
    }
    const c = contactMap.get(key);
    c.count++;
    if (!c.lastDate || r.visit_date > c.lastDate) {
      c.lastDate = r.visit_date;
      c.lastImpression = r.impression;
    }
  });
  const list = Array.from(contactMap.values()).sort((a, b) => b.count - a.count);

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#a0aec0;padding:24px">データがありません</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => `
    <tr>
      <td>${escapeHtml(c.contact)}</td>
      <td>${escapeHtml(c.client)}</td>
      <td>${c.count}</td>
      <td>${impressionBadge(c.lastImpression)}</td>
    </tr>
  `).join('');
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

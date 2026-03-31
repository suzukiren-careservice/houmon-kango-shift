// ===========================
// 入居相談管理システム - ロジック（Supabase対応）
// ===========================

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let consultations = [];
let charts = {};
let currentDetailId = null;
let editingId = null;

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', async () => {
  initDatetime();
  await loadData();
  updateSidebarCount();
  populateMonthFilter();
});

async function loadData() {
  const { data, error } = await db
    .from('consultations')
    .select('*')
    .order('consult_date', { ascending: false });
  if (error) { showToast('データ読み込みエラー', 'error'); return; }
  consultations = data || [];
}

function initDatetime() {
  const now = new Date();
  document.getElementById('consultDate').value = toLocalDatetimeValue(now);
}

function toLocalDatetimeValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

// ===== ビュー切替 =====
function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${viewName}`).classList.add('active');
  document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

  if (viewName === 'list') renderList();
  if (viewName === 'analytics') renderAnalytics();
}

// ===== フォーム保存 =====
async function saveConsultation(event) {
  event.preventDefault();

  const getRadio = (name) => {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : '';
  };
  const getCheckboxes = (name) =>
    Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value);

  const toTZ = (val) => val ? new Date(val).toISOString() : null;
  const toDate = (val) => val || null;

  const record = {
    consult_date:       toTZ(document.getElementById('consultDate').value),
    reception:          getRadio('reception'),
    staff:              document.getElementById('staff').value,
    consultant_name:    document.getElementById('consultantName').value,
    relationship:       document.getElementById('relationship').value,
    user_name:          document.getElementById('userName').value,
    gender:             getRadio('gender'),
    gengou:             document.getElementById('gengou').value,
    birth_year:         document.getElementById('birthYear').value,
    birth_month:        document.getElementById('birthMonth').value,
    birth_day:          document.getElementById('birthDay').value,
    age:                parseInt(document.getElementById('age').value) || null,
    disease:            document.getElementById('disease').value,
    current_status:     getRadio('currentStatus'),
    hospital_name:      document.getElementById('hospitalName').value,
    caseworker:         document.getElementById('caseworker').value,
    care_manager:       document.getElementById('careManager').value,
    care_office:        document.getElementById('careOffice').value,
    care_level:         document.getElementById('careLevel').value,
    disability_grade:   document.getElementById('disabilityGrade').value,
    welfare_card:       getRadio('welfareCard'),
    livelihood:         getRadio('livelihood'),
    doctor:             getRadio('doctor'),
    doctor_other:       document.getElementById('doctorOther').value,
    medical_memo:       document.getElementById('medicalMemo').value,
    med_proc:           getCheckboxes('medProc'),
    dialysis_day:       document.getElementById('dialysisDay').value,
    meal_type:          document.getElementById('mealType').value,
    mobility:           getRadio('mobility'),
    excretion:          getRadio('excretion'),
    bathing:            getRadio('bathing'),
    home_address:       document.getElementById('homeAddress').value,
    key_person:         document.getElementById('keyPerson').value,
    key_person_relation: document.getElementById('keyPersonRelation').value,
    key_person_contact: document.getElementById('keyPersonContact').value,
    tour_request:       getRadio('tourRequest'),
    tour_date:          toTZ(document.getElementById('tourDate').value),
    tour_person:        document.getElementById('tourPerson').value,
    tour_contact:       document.getElementById('tourContact').value,
    floor_pref:         getRadio('floorPref'),
    pre_meeting_date:   toTZ(document.getElementById('preMeetingDate').value),
    ent_conf_date:      toTZ(document.getElementById('entConfDate').value),
    conf1_date:         toDate(document.getElementById('conf1Date').value),
    conf1_time:         document.getElementById('conf1Time').value,
    conf1_attend:       document.getElementById('conf1Attend').value,
    conf2_date:         toDate(document.getElementById('conf2Date').value),
    conf2_time:         document.getElementById('conf2Time').value,
    conf2_attend:       document.getElementById('conf2Attend').value,
    conf3_date:         toDate(document.getElementById('conf3Date').value),
    conf3_time:         document.getElementById('conf3Time').value,
    conf3_attend:       document.getElementById('conf3Attend').value,
    notes:              document.getElementById('notes').value,
    facility:           getRadio('facility'),
    progress_status:    document.getElementById('progressStatus').value,
  };

  const btn = document.querySelector('.btn-primary');
  btn.textContent = editingId ? '更新中...' : '保存中...';
  btn.disabled = true;

  let error;
  if (editingId) {
    ({ error } = await db.from('consultations').update(record).eq('id', editingId));
  } else {
    ({ error } = await db.from('consultations').insert(record));
  }

  btn.disabled = false;

  if (error) {
    btn.textContent = editingId ? '更新する' : '保存する';
    showToast('保存エラー：' + error.message, 'error');
    return;
  }

  const wasEditing = !!editingId;
  editingId = null;
  document.getElementById('editModeBanner').style.display = 'none';
  btn.textContent = '保存する';

  await loadData();
  updateSidebarCount();
  showToast(wasEditing ? '更新しました' : '保存しました', 'success');
  clearForm();
}

function clearForm() {
  document.getElementById('consultationForm').reset();
  initDatetime();
}

// ===== 一覧表示 =====
function renderList() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const filterLevel = document.getElementById('filterCareLevel').value;
  const filterMonth = document.getElementById('filterMonth').value;
  const filterFacility = document.getElementById('filterFacility').value;
  const filterProgress = document.getElementById('filterProgress').value;

  let filtered = consultations.filter(c => {
    const matchSearch = !search ||
      (c.user_name || '').toLowerCase().includes(search) ||
      (c.disease || '').toLowerCase().includes(search) ||
      (c.staff || '').toLowerCase().includes(search) ||
      (c.care_manager || '').toLowerCase().includes(search) ||
      (c.consultant_name || '').toLowerCase().includes(search);

    const matchLevel = !filterLevel || c.care_level === filterLevel;
    const matchFacility = !filterFacility || c.facility === filterFacility;
    const matchProgress = !filterProgress || c.progress_status === filterProgress;

    let matchMonth = true;
    if (filterMonth && c.consult_date) {
      const ym = c.consult_date.substring(0, 7);
      matchMonth = ym === filterMonth;
    }

    return matchSearch && matchLevel && matchFacility && matchProgress && matchMonth;
  });

  document.getElementById('listCount').textContent = `${filtered.length} 件`;

  const container = document.getElementById('consultationList');
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">該当する相談記録が見つかりません</div>
      </div>`;
    return;
  }

  const PROGRESS_COLORS = {
    '対応中':   'ps-active',
    '見学予定': 'ps-tour',
    '入居決定': 'ps-admitted',
    '保留中':   'ps-hold',
    '連絡不通': 'ps-unreachable',
    '辞退・無し': 'ps-declined',
  };
  const FACILITY_COLORS = { 'わが家': 'fac-wagaya', '大ちゃん家': 'fac-daichan', 'どちらでも': 'fac-either' };

  container.innerHTML = filtered.map(c => {
    const date = c.consult_date ? formatDateDisplay(c.consult_date) : '日時不明';
    const ps = c.progress_status || '対応中';
    const psClass = PROGRESS_COLORS[ps] || 'ps-active';
    const facClass = FACILITY_COLORS[c.facility] || '';
    const careBadge = c.care_level ? `<span class="badge badge-blue">${c.care_level}</span>` : '';
    const sitBadge = c.current_status ? `<span class="badge badge-gray">${c.current_status}</span>` : '';
    const tourBadge = c.tour_request === '有' ? `<span class="badge badge-green">見学希望</span>` : '';
    const livelihoodBadge = c.livelihood === '有' ? `<span class="badge badge-orange">生活保護</span>` : '';
    const medCount = c.med_proc && c.med_proc.length > 0 ? `<span class="badge badge-red">医療処置 ${c.med_proc.length}件</span>` : '';
    const facilityBadge = c.facility ? `<span class="badge ${facClass}">${c.facility}</span>` : '';

    return `
      <div class="case-card ${psClass}" data-status="${ps}" onclick="openDetail('${c.id}')">
        <div class="case-main">
          <div class="case-name-row">
            <span class="case-name">${c.user_name || '（氏名未入力）'} <span style="font-size:13px;font-weight:400;color:#718096">${c.gender ? c.gender + '性' : ''} ${c.age ? c.age + '歳' : ''}</span></span>
            <span class="progress-status-badge ${psClass}">${ps}</span>
            ${facilityBadge}
          </div>
          <div class="case-meta">
            <span class="case-date">📅 ${date}</span>
            ${careBadge}${sitBadge}${tourBadge}${livelihoodBadge}${medCount}
          </div>
          <div class="case-disease">${c.disease ? '病名：' + c.disease : ''} ${c.care_manager ? '　CM：' + c.care_manager : ''}</div>
        </div>
        <div class="case-side">
          <select class="quick-status-select" onclick="event.stopPropagation()" onchange="quickUpdateStatus('${c.id}', this.value)">
            <option value="対応中"   ${ps==='対応中'   ? 'selected':''}>対応中</option>
            <option value="見学予定" ${ps==='見学予定' ? 'selected':''}>見学予定</option>
            <option value="入居決定" ${ps==='入居決定' ? 'selected':''}>入居決定</option>
            <option value="保留中"   ${ps==='保留中'   ? 'selected':''}>保留中</option>
            <option value="連絡不通" ${ps==='連絡不通' ? 'selected':''}>連絡不通</option>
            <option value="辞退・無し" ${ps==='辞退・無し' ? 'selected':''}>辞退・無し</option>
          </select>
          <span style="font-size:12px;color:#a0aec0">${c.reception || ''}</span>
          <span style="font-size:12px;color:#a0aec0">${c.staff ? '担当：' + c.staff : ''}</span>
        </div>
      </div>`;
  }).join('');
}

function formatDateDisplay(dtStr) {
  if (!dtStr) return '';
  const d = new Date(dtStr);
  if (isNaN(d)) return dtStr;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}年${m}月${day}日 ${h}:${min}`;
}

function populateMonthFilter() {
  const months = [...new Set(
    consultations.map(c => c.consult_date ? c.consult_date.substring(0, 7) : null).filter(Boolean)
  )].sort().reverse();
  const sel = document.getElementById('filterMonth');
  // 既存オプションをクリア（最初の「すべて」以外）
  while (sel.options.length > 1) sel.remove(1);
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    const [y, mo] = m.split('-');
    opt.textContent = `${y}年${parseInt(mo)}月`;
    sel.appendChild(opt);
  });
}

// ===== 詳細モーダル =====
function openDetail(id) {
  const c = consultations.find(x => x.id === id);
  if (!c) return;
  currentDetailId = id;

  document.getElementById('modalTitle').textContent = c.user_name ? `${c.user_name} 様　相談詳細` : '相談詳細';

  const birthStr = c.gengou && c.birth_year ? `${c.gengou}${c.birth_year}年${c.birth_month || ''}月${c.birth_day || ''}日` : '';
  const doctorStr = c.doctor === 'その他' ? c.doctor_other : c.doctor;
  const confStr = [
    c.conf1_date ? `① ${c.conf1_date}${c.conf1_time ? ' ' + c.conf1_time : ''}　${c.conf1_attend || ''}` : '',
    c.conf2_date ? `② ${c.conf2_date}${c.conf2_time ? ' ' + c.conf2_time : ''}　${c.conf2_attend || ''}` : '',
    c.conf3_date ? `③ ${c.conf3_date}${c.conf3_time ? ' ' + c.conf3_time : ''}　${c.conf3_attend || ''}` : '',
  ].filter(Boolean).join('<br>');

  document.getElementById('modalBody').innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">基本情報</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">相談日時</span><span class="detail-value">${formatDateDisplay(c.consult_date)}</span></div>
        <div class="detail-item"><span class="detail-label">受付方法</span><span class="detail-value">${c.reception || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">対象施設</span><span class="detail-value">${c.facility || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">進捗ステータス</span><span class="detail-value">${c.progress_status || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">対応スタッフ</span><span class="detail-value">${c.staff || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">相談者</span><span class="detail-value">${c.consultant_name || '-'}${c.relationship ? '（' + c.relationship + '）' : ''}</span></div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">利用予定者</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">氏名</span><span class="detail-value">${c.user_name || '-'}　${c.gender || ''}</span></div>
        <div class="detail-item"><span class="detail-label">生年月日・年齢</span><span class="detail-value">${birthStr || '-'}　${c.age ? c.age + '歳' : ''}</span></div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">病状・医療情報</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">病名</span><span class="detail-value">${c.disease || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">現在の状況</span><span class="detail-value">${c.current_status || '-'}${c.hospital_name ? '（' + c.hospital_name + '）' : ''}</span></div>
        <div class="detail-item"><span class="detail-label">担当相談員</span><span class="detail-value">${c.caseworker || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">担当CM</span><span class="detail-value">${c.care_manager || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">居宅介護支援事業所</span><span class="detail-value">${c.care_office || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">介護度</span><span class="detail-value">${c.care_level || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">身障手帳</span><span class="detail-value">${c.disability_grade ? c.disability_grade + '級' : '-'}</span></div>
        <div class="detail-item"><span class="detail-label">福祉医療受給者証</span><span class="detail-value">${c.welfare_card || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">生活保護</span><span class="detail-value">${c.livelihood || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">主治医</span><span class="detail-value">${doctorStr || '-'}</span></div>
      </div>
      ${c.medical_memo ? `<div style="margin-top:10px"><span class="detail-label">病状メモ</span><p style="font-size:13px;margin-top:4px;color:#2d3748;white-space:pre-wrap">${c.medical_memo}</p></div>` : ''}
      ${c.med_proc && c.med_proc.length > 0 ? `
        <div style="margin-top:10px">
          <span class="detail-label">医療処置</span>
          <div class="tag-list" style="margin-top:6px">${c.med_proc.map(p => `<span class="tag">${p}</span>`).join('')}</div>
        </div>` : ''}
      ${c.dialysis_day ? `<div style="margin-top:8px"><span class="detail-label">人工透析（曜日）</span><span style="font-size:13px;margin-left:8px">${c.dialysis_day}</span></div>` : ''}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">生活状況</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">食事形態</span><span class="detail-value">${c.meal_type || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">移動動作</span><span class="detail-value">${c.mobility || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">排泄</span><span class="detail-value">${c.excretion || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">入浴</span><span class="detail-value">${c.bathing || '-'}</span></div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">連絡先・キーパーソン</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">自宅住所</span><span class="detail-value">${c.home_address || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">キーパーソン</span><span class="detail-value">${c.key_person || '-'}${c.key_person_relation ? '（' + c.key_person_relation + '）' : ''}</span></div>
        <div class="detail-item"><span class="detail-label">連絡先</span><span class="detail-value">${c.key_person_contact || '-'}</span></div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">見学・部屋・カンファレンス</div>
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">見学希望</span><span class="detail-value">${c.tour_request || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">見学希望日時</span><span class="detail-value">${c.tour_date ? formatDateDisplay(c.tour_date) : '-'}</span></div>
        <div class="detail-item"><span class="detail-label">予定見学者</span><span class="detail-value">${c.tour_person || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">見学者連絡先</span><span class="detail-value">${c.tour_contact || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">希望部屋</span><span class="detail-value">${c.floor_pref || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">主治医</span><span class="detail-value">${doctorStr || '-'}</span></div>
        <div class="detail-item"><span class="detail-label">事前面談</span><span class="detail-value">${c.pre_meeting_date ? formatDateDisplay(c.pre_meeting_date) : '-'}</span></div>
        <div class="detail-item"><span class="detail-label">ENTカンファレンス</span><span class="detail-value">${c.ent_conf_date ? formatDateDisplay(c.ent_conf_date) : '-'}</span></div>
      </div>
      ${confStr ? `<div style="margin-top:10px"><span class="detail-label">退院調整カンファレンス候補日</span><p style="font-size:13px;margin-top:6px;line-height:1.8">${confStr}</p></div>` : ''}
    </div>
    ${c.notes ? `
    <div class="detail-section">
      <div class="detail-section-title">備考</div>
      <p style="font-size:13px;color:#2d3748;white-space:pre-wrap">${c.notes}</p>
    </div>` : ''}
  `;

  document.getElementById('modalDeleteBtn').onclick = () => deleteConsultation(id);
  document.getElementById('modalEditBtn').onclick = () => editConsultation(id);
  document.getElementById('detailModal').classList.add('open');
}

function closeModal(event) {
  if (event.target === document.getElementById('detailModal')) closeModalDirect();
}

function closeModalDirect() {
  document.getElementById('detailModal').classList.remove('open');
}

function editConsultation(id) {
  const c = consultations.find(x => x.id === id);
  if (!c) return;
  editingId = id;
  closeModalDirect();

  const setRadio = (name, value) => {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
  };
  const toFormDT = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : toLocalDatetimeValue(d);
  };

  document.getElementById('consultDate').value = toFormDT(c.consult_date);
  setRadio('reception', c.reception);
  document.getElementById('staff').value = c.staff || '';
  setRadio('facility', c.facility);
  document.getElementById('progressStatus').value = c.progress_status || '対応中';
  document.getElementById('consultantName').value = c.consultant_name || '';
  document.getElementById('relationship').value = c.relationship || '';

  document.getElementById('userName').value = c.user_name || '';
  setRadio('gender', c.gender);
  document.getElementById('gengou').value = c.gengou || 'S';
  document.getElementById('birthYear').value = c.birth_year || '';
  document.getElementById('birthMonth').value = c.birth_month || '';
  document.getElementById('birthDay').value = c.birth_day || '';
  document.getElementById('age').value = c.age || '';

  document.getElementById('disease').value = c.disease || '';
  setRadio('currentStatus', c.current_status);
  document.getElementById('hospitalName').value = c.hospital_name || '';
  document.getElementById('caseworker').value = c.caseworker || '';
  document.getElementById('careManager').value = c.care_manager || '';
  document.getElementById('careOffice').value = c.care_office || '';
  document.getElementById('careLevel').value = c.care_level || '';
  document.getElementById('disabilityGrade').value = c.disability_grade || '';
  setRadio('welfareCard', c.welfare_card);
  setRadio('livelihood', c.livelihood);
  setRadio('doctor', c.doctor);
  document.getElementById('doctorOther').value = c.doctor_other || '';
  document.getElementById('medicalMemo').value = c.medical_memo || '';
  document.querySelectorAll('input[name="medProc"]').forEach(cb => {
    cb.checked = (c.med_proc || []).includes(cb.value);
  });
  document.getElementById('dialysisDay').value = c.dialysis_day || '';

  document.getElementById('mealType').value = c.meal_type || '';
  setRadio('mobility', c.mobility);
  setRadio('excretion', c.excretion);
  setRadio('bathing', c.bathing);

  document.getElementById('homeAddress').value = c.home_address || '';
  document.getElementById('keyPerson').value = c.key_person || '';
  document.getElementById('keyPersonRelation').value = c.key_person_relation || '';
  document.getElementById('keyPersonContact').value = c.key_person_contact || '';

  setRadio('tourRequest', c.tour_request);
  document.getElementById('tourDate').value = toFormDT(c.tour_date);
  document.getElementById('tourPerson').value = c.tour_person || '';
  document.getElementById('tourContact').value = c.tour_contact || '';
  setRadio('floorPref', c.floor_pref);

  document.getElementById('preMeetingDate').value = toFormDT(c.pre_meeting_date);
  document.getElementById('entConfDate').value = toFormDT(c.ent_conf_date);
  document.getElementById('conf1Date').value = c.conf1_date || '';
  document.getElementById('conf1Time').value = c.conf1_time || '';
  document.getElementById('conf1Attend').value = c.conf1_attend || '';
  document.getElementById('conf2Date').value = c.conf2_date || '';
  document.getElementById('conf2Time').value = c.conf2_time || '';
  document.getElementById('conf2Attend').value = c.conf2_attend || '';
  document.getElementById('conf3Date').value = c.conf3_date || '';
  document.getElementById('conf3Time').value = c.conf3_time || '';
  document.getElementById('conf3Attend').value = c.conf3_attend || '';

  document.getElementById('notes').value = c.notes || '';

  document.getElementById('editModeBanner').style.display = 'flex';
  document.getElementById('editModeName').textContent = c.user_name || '（氏名未入力）';
  document.querySelector('.btn-primary').textContent = '更新する';

  showView('form');
  window.scrollTo(0, 0);
}

function cancelEdit() {
  editingId = null;
  document.getElementById('editModeBanner').style.display = 'none';
  document.querySelector('.btn-primary').textContent = '保存する';
  clearForm();
}

async function quickUpdateStatus(id, newStatus) {
  const { error } = await db.from('consultations').update({ progress_status: newStatus }).eq('id', id);
  if (error) { showToast('更新エラー', 'error'); return; }
  const idx = consultations.findIndex(c => c.id === id);
  if (idx !== -1) consultations[idx].progress_status = newStatus;
  renderList();
  showToast(`ステータスを「${newStatus}」に更新しました`, 'success');
}

async function deleteConsultation(id) {
  if (!confirm('この相談記録を削除しますか？')) return;
  const { error } = await db.from('consultations').delete().eq('id', id);
  if (error) { showToast('削除エラー', 'error'); return; }
  await loadData();
  updateSidebarCount();
  closeModalDirect();
  renderList();
  showToast('削除しました', 'error');
}

// ===== 分析 =====
function renderAnalytics() {
  const total = consultations.length;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('analyticsSubtitle').textContent = `全 ${total} 件のデータをもとに集計`;

  const now = new Date();
  const thisYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = consultations.filter(c => c.consult_date && c.consult_date.startsWith(thisYM)).length;
  document.getElementById('statThisMonth').textContent = thisMonth;

  const tourYes = consultations.filter(c => c.tour_request === '有').length;
  const tourRate = total > 0 ? Math.round(tourYes / total * 100) : 0;
  document.getElementById('statTourRate').textContent = `${tourRate}%`;

  const ages = consultations.map(c => c.age).filter(a => a && a > 0);
  const avgAge = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;
  document.getElementById('statAvgAge').textContent = avgAge !== null ? `${avgAge}歳` : '-';

  drawMonthlyChart();
  drawCareLevelChart();
  drawReceptionChart();
  drawMedProcChart();
  drawStatusChart();
  drawGenderChart();
}

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); charts[key] = null; }
}

const CHART_COLORS = [
  '#4299e1','#48bb78','#ed8936','#9f7aea','#f56565',
  '#38b2ac','#ecc94b','#667eea','#fc8181','#68d391'
];

function drawMonthlyChart() {
  destroyChart('monthly');
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      label: `${d.getMonth() + 1}月`,
      count: consultations.filter(c => c.consult_date && c.consult_date.startsWith(ym)).length
    });
  }
  charts['monthly'] = new Chart(document.getElementById('monthlyChart'), {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [{ label: '件数', data: months.map(m => m.count), backgroundColor: '#4299e1', borderRadius: 5 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}

function drawCareLevelChart() {
  destroyChart('careLevel');
  const levels = ['支援1','支援2','介護1','介護2','介護3','介護4','介護5','申請中','申請未','区変中'];
  const nonZero = levels.map(l => ({ label: l, count: consultations.filter(c => c.care_level === l).length })).filter(x => x.count > 0);
  charts['careLevel'] = new Chart(document.getElementById('careLevelChart'), {
    type: 'doughnut',
    data: { labels: nonZero.map(x => x.label), datasets: [{ data: nonZero.map(x => x.count), backgroundColor: CHART_COLORS }] },
    options: { responsive: true, plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } } }
  });
}

function drawReceptionChart() {
  destroyChart('reception');
  charts['reception'] = new Chart(document.getElementById('receptionChart'), {
    type: 'pie',
    data: {
      labels: ['来訪', 'TEL'],
      datasets: [{ data: [consultations.filter(c => c.reception === '来訪').length, consultations.filter(c => c.reception === 'TEL').length], backgroundColor: ['#4299e1','#48bb78'] }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function drawMedProcChart() {
  destroyChart('medProc');
  const counts = {};
  consultations.forEach(c => (c.med_proc || []).forEach(p => { counts[p] = (counts[p] || 0) + 1; }));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  charts['medProc'] = new Chart(document.getElementById('medProcChart'), {
    type: 'bar',
    data: {
      labels: sorted.map(x => x[0]),
      datasets: [{ label: '件数', data: sorted.map(x => x[1]), backgroundColor: '#9f7aea', borderRadius: 4 }]
    },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}

function drawStatusChart() {
  destroyChart('status');
  const s = ['入院中','在宅','施設'];
  charts['status'] = new Chart(document.getElementById('statusChart'), {
    type: 'pie',
    data: { labels: s, datasets: [{ data: s.map(x => consultations.filter(c => c.current_status === x).length), backgroundColor: ['#f56565','#48bb78','#ed8936'] }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function drawGenderChart() {
  destroyChart('gender');
  charts['gender'] = new Chart(document.getElementById('genderChart'), {
    type: 'doughnut',
    data: {
      labels: ['男性','女性'],
      datasets: [{ data: [consultations.filter(c => c.gender === '男').length, consultations.filter(c => c.gender === '女').length], backgroundColor: ['#4299e1','#f687b3'] }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

// ===== ユーティリティ =====
function updateSidebarCount() {
  document.getElementById('sidebarCount').textContent = `${consultations.length} 件の記録`;
}

function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => { el.classList.remove('show'); }, 2500);
}

// ===== CSVエクスポート =====
function exportCSV() {
  if (consultations.length === 0) { showToast('データがありません', 'error'); return; }

  const headers = [
    '相談日時','受付','対象施設','進捗ステータス','スタッフ','相談者名','関係','利用予定者名','性別','元号','生年（年）','生年（月）','生年（日）','年齢',
    '病名','現在の状況','入院先','担当相談員','CM','居宅事業所','介護度','身障手帳級','福祉医療','生活保護',
    '主治医','病状メモ','医療処置','人工透析曜日',
    '食事形態','移動','排泄','入浴',
    '住所','キーパーソン','続柄','連絡先',
    '見学希望','見学日時','見学者','見学連絡先','希望部屋',
    '事前面談','ENTカンファレンス',
    'カンファ①日','カンファ①時','カンファ①出席者',
    'カンファ②日','カンファ②時','カンファ②出席者',
    'カンファ③日','カンファ③時','カンファ③出席者',
    '備考'
  ];

  const rows = consultations.map(c => [
    c.consult_date, c.reception, c.facility, c.progress_status, c.staff, c.consultant_name, c.relationship, c.user_name, c.gender,
    c.gengou, c.birth_year, c.birth_month, c.birth_day, c.age,
    c.disease, c.current_status, c.hospital_name, c.caseworker, c.care_manager, c.care_office, c.care_level,
    c.disability_grade, c.welfare_card, c.livelihood, c.doctor === 'その他' ? c.doctor_other : c.doctor,
    c.medical_memo, (c.med_proc || []).join('・'), c.dialysis_day,
    c.meal_type, c.mobility, c.excretion, c.bathing,
    c.home_address, c.key_person, c.key_person_relation, c.key_person_contact,
    c.tour_request, c.tour_date, c.tour_person, c.tour_contact, c.floor_pref,
    c.pre_meeting_date, c.ent_conf_date,
    c.conf1_date, c.conf1_time, c.conf1_attend,
    c.conf2_date, c.conf2_time, c.conf2_attend,
    c.conf3_date, c.conf3_time, c.conf3_attend,
    c.notes
  ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`));

  const bom = '\uFEFF';
  const csv = bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  a.download = `入居相談_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSVをダウンロードしました', 'success');
}

// ===== Supabase =====
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== カテゴリ定義（報告書に準拠） =====
const CATEGORIES = [
  {
    id: 1, name: '①転倒系',
    sections: [
      { key: 'types',    type: 'checkbox', label: 'タイプ', options: ['転倒', '転落', '滑落'] },
      { key: 'injuries', type: 'checkbox', label: '外傷',   options: ['外傷なし', '擦過傷', '表皮剥離', '打撲', '骨折', 'その他'] },
      { key: 'bodyPart', type: 'text',     label: '部位',   placeholder: '例：右大腿' },
    ],
  },
  {
    id: 2, name: '②誤嚥系',
    sections: [
      { key: 'options', type: 'checkbox', label: '', options: ['とろみ剤使用していない', '姿勢や周囲の環境', '誤飲', 'その他'] },
    ],
  },
  {
    id: 3, name: '③誤薬系',
    sections: [
      { key: 'drugTypes',  type: 'checkbox', label: '薬の種類',   options: ['注射薬・点滴', '内服', '外用薬', '坐薬', '貼付薬', 'その他'] },
      { key: 'errorTypes', type: 'checkbox', label: 'ミスの種類', options: ['薬剤間違い', 'セット間違い', 'その他'] },
      { key: 'adminTypes', type: 'checkbox', label: '投与',       options: ['投与方法', '未投与', '投与量', 'その他'] },
    ],
  },
  {
    id: 4, name: '④体調変化',
    sections: [
      { key: 'options', type: 'checkbox', label: '', options: ['体温調整', '食中毒', 'バイタルサインの変動', '食事・水分量の過剰・過少', 'その他'] },
    ],
  },
  {
    id: 5, name: '⑤外傷',
    sections: [
      { key: 'injuryTypes', type: 'checkbox', label: '外傷タイプ', options: ['熱傷', '擦過傷', '表皮剥離', '打撲', '骨折', '褥瘡', 'その他'] },
      { key: 'situations',  type: 'checkbox', label: '状況',       options: ['入浴・シャワー浴中', '体動時', 'オムツ交換時', '処置中', '移動時', '排泄時', '機器やチューブによる', '留置固定部位障害', 'その他'] },
    ],
  },
  {
    id: 6, name: '⑥感染',
    sections: [
      { key: 'options', type: 'checkbox', label: '', options: ['創傷', '褥瘡壊死', 'カテーテル類', '清潔操作の不備', 'その他'] },
    ],
  },
  {
    id: 7, name: '⑦損失',
    sections: [
      { key: 'options', type: 'checkbox', label: '', options: ['経済的損失', '物質的損失', '物品の破損', 'その他'] },
    ],
  },
  {
    id: 8, name: '⑧サービス対応不備',
    sections: [
      { key: 'options', type: 'checkbox', label: '', options: ['予定ミス→時間変更し忘れ', '訪問忘れ', '訪問間違い', 'その他'] },
    ],
  },
  {
    id: 9, name: '⑨個人的情報漏洩',
    sections: [
      { key: 'options', type: 'checkbox', label: '', options: ['タブレットや記録物の紛失・置き忘れ', 'その他'] },
    ],
  },
  {
    id: 10, name: '⑩信頼関係の喪失',
    sections: [
      { key: 'options', type: 'checkbox', label: '', options: ['接遇に対しての不満', '電話対応での伝達ミス', 'その他'] },
    ],
  },
  {
    id: 11, name: '⑪交通事故',
    sections: [
      { key: 'options', type: 'checkbox', label: '', options: ['自動車', '自転車', '徒歩'] },
    ],
  },
  {
    id: 12, name: '⑫その他',
    sections: [],
  },
];

// ===== ユーティリティ =====
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function genMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    opts.push({ value, label });
  }
  return opts;
}

function initSelections() {
  const sel = {};
  CATEGORIES.forEach(cat => {
    sel[cat.id] = {};
    cat.sections.forEach(s => {
      sel[cat.id][s.key] = s.type === 'checkbox' ? [] : '';
    });
  });
  return sel;
}

function blankForm() {
  return {
    reportDate: todayStr(),
    incidentDate: todayStr(),
    incidentTime: '',
    targetPerson: '',
    classification: '',
    selectedCatIds: [],
    selections: initSelections(),
    details: '',
    result: '',
    response: '',
  };
}

// ===== Vue アプリ =====
const { createApp } = Vue;

createApp({
  data() {
    const monthOpts = genMonthOptions();
    return {
      CATEGORIES,
      loading: true,

      // パスワード認証
      appAuthenticated: false,
      appPassword: '',
      pwdInput: '',
      pwdError: false,
      // パスワード変更（管理者用）
      pwdChange: { input: '', confirm: '', saving: false, error: '', success: false },

      // タブ
      currentTab: 'report',
      tabs: [
        { id: 'report',   icon: '📝', label: '報告' },
        { id: 'list',     icon: '📋', label: '一覧' },
        { id: 'analysis', icon: '📊', label: '分析' },
        { id: 'settings', icon: '⚙️', label: '設定', adminOnly: true },
      ],

      // スタッフ
      staffList: [],
      currentStaff: null,

      // フォーム
      form: blankForm(),
      submitting: false,
      submitSuccess: false,

      // 一覧
      incidents: [],
      listMonth: monthOpts[0].value,

      // 分析
      analysisMonth: monthOpts[0].value,
      allIncidents: [],

      // 月オプション（共通）
      monthOptions: monthOpts,

      // チャート
      barChartInst: null,
      lineChartInst: null,

      // 詳細モーダル
      detail: { show: false, d: {} },

      // 全スタッフ（設定画面用）
      allStaff: [],

      // 編集モーダル
      editModal: {
        show: false, saving: false,
        incidentId: null,
        incidentDate: '', incidentTime: '',
        targetPerson: '', classification: '',
        selectedCatIds: [],
        selections: initSelections(),
        details: '', result: '', response: '',
      },
    };
  },

  computed: {
    visibleTabs() {
      return this.tabs.filter(t => !t.adminOnly || (this.currentStaff && this.currentStaff.is_admin));
    },

    analysisLabel() {
      const m = this.monthOptions.find(m => m.value === this.analysisMonth);
      return m ? m.label : '';
    },

    monthlyTotal() {
      return this.allIncidents.filter(inc =>
        inc.incident_date?.startsWith(this.analysisMonth)
      ).length;
    },

    monthlySummary() {
      const incs = this.allIncidents.filter(inc =>
        inc.incident_date?.startsWith(this.analysisMonth)
      );
      const s = { 'ヒヤリハット': 0, 'インシデント': 0, 'アクシデント': 0, topCat: null };
      incs.forEach(inc => {
        if (inc.classification && s[inc.classification] !== undefined) s[inc.classification]++;
      });
      // 最多カテゴリ
      const catCnt = {};
      incs.forEach(inc => {
        (inc.category_ids || []).forEach(id => {
          const cat = CATEGORIES.find(c => c.id === id);
          if (cat) catCnt[cat.name] = (catCnt[cat.name] || 0) + 1;
        });
      });
      const top = Object.entries(catCnt).sort((a, b) => b[1] - a[1])[0];
      s.topCat = top ? top[0] : null;
      return s;
    },
  },

  async mounted() {
    await this.loadAppPassword();
    const storedAuth = localStorage.getItem('app_auth');
    if (storedAuth && storedAuth === this.appPassword) {
      this.appAuthenticated = true;
      const saved = localStorage.getItem('incident_staff');
      if (saved) {
        try { this.currentStaff = JSON.parse(saved); } catch {}
      }
      await this.loadStaff();
      if (this.currentStaff) {
        await this.loadIncidents();
        await this.loadAllIncidents();
      }
    }
    this.loading = false;
  },

  methods: {

    // ===== パスワード認証 =====
    async loadAppPassword() {
      const { data } = await db.from('settings').select('value').eq('key', 'app_password').single();
      this.appPassword = data?.value || '';
    },

    async checkPassword() {
      if (!this.pwdInput) return;
      if (this.pwdInput === this.appPassword) {
        localStorage.setItem('app_auth', this.appPassword);
        this.appAuthenticated = true;
        this.pwdError = false;
        this.pwdInput = '';
        const saved = localStorage.getItem('incident_staff');
        if (saved) {
          try { this.currentStaff = JSON.parse(saved); } catch {}
        }
        await this.loadStaff();
        if (this.currentStaff) {
          await this.loadIncidents();
          await this.loadAllIncidents();
        }
      } else {
        this.pwdError = true;
        this.pwdInput = '';
      }
    },

    async saveAppPassword() {
      this.pwdChange.error = '';
      if (!this.pwdChange.input) { this.pwdChange.error = 'パスワードを入力してください'; return; }
      if (this.pwdChange.input !== this.pwdChange.confirm) { this.pwdChange.error = 'パスワードが一致しません'; return; }
      this.pwdChange.saving = true;
      try {
        const { error } = await db.from('settings')
          .update({ value: this.pwdChange.input })
          .eq('key', 'app_password');
        if (error) throw error;
        this.appPassword = this.pwdChange.input;
        localStorage.setItem('app_auth', this.appPassword);
        this.pwdChange.input = '';
        this.pwdChange.confirm = '';
        this.pwdChange.success = true;
        setTimeout(() => { this.pwdChange.success = false; }, 3000);
      } catch (e) {
        this.pwdChange.error = '保存エラー: ' + e.message;
      } finally {
        this.pwdChange.saving = false;
      }
    },

    // ===== スタッフ =====
    async loadStaff() {
      const { data } = await db.from('staff').select('*').eq('active', true).order('name');
      this.staffList = data || [];
      // localStorageのキャッシュを最新DBデータで上書き
      if (this.currentStaff) {
        const fresh = this.staffList.find(s => s.id === this.currentStaff.id);
        if (fresh) {
          this.currentStaff = fresh;
          localStorage.setItem('incident_staff', JSON.stringify(fresh));
        }
      }
    },

    selectStaff(staff) {
      this.currentStaff = staff;
      localStorage.setItem('incident_staff', JSON.stringify(staff));
      this.loadIncidents();
      this.loadAllIncidents();
    },

    logout() {
      this.currentStaff = null;
      localStorage.removeItem('incident_staff');
    },

    // ===== フォーム =====
    isCatSelected(catId) {
      return this.form.selectedCatIds.includes(catId);
    },

    toggleCat(catId) {
      const idx = this.form.selectedCatIds.indexOf(catId);
      if (idx === -1) {
        this.form.selectedCatIds.push(catId);
      } else {
        this.form.selectedCatIds.splice(idx, 1);
      }
    },

    async submitReport() {
      if (!this.currentStaff) return;
      if (this.form.selectedCatIds.length === 0 && !this.form.details) {
        alert('カテゴリを選択するか、具体的内容を入力してください。');
        return;
      }
      this.submitting = true;
      try {
        const payload = {
          report_date:    this.form.reportDate,
          staff_id:       this.currentStaff.id,
          staff_name:     this.currentStaff.name,
          incident_date:  this.form.incidentDate,
          incident_time:  this.form.incidentTime || null,
          target_person:  this.form.targetPerson,
          classification: this.form.classification,
          category_ids:   this.form.selectedCatIds,
          selections:     this.form.selections,
          details:        this.form.details,
          result:         this.form.result,
          response:       this.form.response,
        };
        const { error } = await db.from('incidents').insert([payload]);
        if (error) throw error;
        this.form = blankForm();
        this.submitSuccess = true;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => { this.submitSuccess = false; }, 3500);
        // 一覧・分析データも更新
        await this.loadIncidents();
        await this.loadAllIncidents();
      } catch (e) {
        alert('送信エラー: ' + e.message);
      } finally {
        this.submitting = false;
      }
    },

    // ===== 一覧 =====
    async loadIncidents() {
      const [y, m] = this.listMonth.split('-');
      const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
      const start = `${y}-${m}-01`;
      const end   = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
      const { data } = await db.from('incidents')
        .select('*')
        .gte('incident_date', start)
        .lte('incident_date', end)
        .order('incident_date', { ascending: false });
      this.incidents = data || [];
    },

    openDetail(inc) {
      this.detail = { show: true, d: inc };
    },

    // ===== 管理者：編集 =====
    openEdit(inc) {
      // initSelections() のベースに保存データをマージ
      const base = initSelections();
      const stored = inc.selections || {};
      CATEGORIES.forEach(cat => {
        if (stored[cat.id]) {
          cat.sections.forEach(sec => {
            if (stored[cat.id][sec.key] !== undefined) {
              base[cat.id][sec.key] = stored[cat.id][sec.key];
            }
          });
        }
      });
      this.editModal = {
        show: true, saving: false,
        incidentId: inc.id,
        incidentDate:  inc.incident_date || '',
        incidentTime:  inc.incident_time ? inc.incident_time.slice(0, 5) : '',
        targetPerson:  inc.target_person || '',
        classification: inc.classification || '',
        selectedCatIds: [...(inc.category_ids || [])],
        selections: base,
        details:  inc.details  || '',
        result:   inc.result   || '',
        response: inc.response || '',
      };
    },

    toggleEditCat(catId) {
      const idx = this.editModal.selectedCatIds.indexOf(catId);
      if (idx === -1) this.editModal.selectedCatIds.push(catId);
      else this.editModal.selectedCatIds.splice(idx, 1);
    },

    async saveEdit() {
      this.editModal.saving = true;
      try {
        const payload = {
          incident_date:  this.editModal.incidentDate,
          incident_time:  this.editModal.incidentTime || null,
          target_person:  this.editModal.targetPerson,
          classification: this.editModal.classification,
          category_ids:   this.editModal.selectedCatIds,
          selections:     this.editModal.selections,
          details:        this.editModal.details,
          result:         this.editModal.result,
          response:       this.editModal.response,
        };
        const { error } = await db.from('incidents')
          .update(payload)
          .eq('id', this.editModal.incidentId);
        if (error) throw error;
        this.editModal.show = false;
        await this.loadIncidents();
        await this.loadAllIncidents();
      } catch (e) {
        alert('更新エラー: ' + e.message);
      } finally {
        this.editModal.saving = false;
      }
    },

    // ===== 管理者：削除 =====
    async deleteIncident(inc) {
      const name = inc.target_person || 'このインシデント';
      const date = this.fmtDate(inc.incident_date);
      if (!confirm(`【${date}】${name} の報告を削除しますか？\n\nこの操作は元に戻せません。`)) return;
      const { error } = await db.from('incidents').delete().eq('id', inc.id);
      if (error) { alert('削除エラー: ' + error.message); return; }
      await this.loadIncidents();
      await this.loadAllIncidents();
    },

    // ===== 分析 =====
    async loadAllIncidents() {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      const { data } = await db.from('incidents')
        .select('incident_date, classification, category_ids')
        .gte('incident_date', cutoff.toISOString().slice(0, 10))
        .order('incident_date');
      this.allIncidents = data || [];
    },

    async switchTab(tabId) {
      this.currentTab = tabId;
      if (tabId === 'list') {
        await this.loadIncidents();
      } else if (tabId === 'analysis') {
        await this.loadAllIncidents();
        await this.$nextTick();
        this.drawCharts();
      } else if (tabId === 'settings') {
        await this.loadAllStaff();
      }
    },

    // ===== 管理者設定 =====
    async loadAllStaff() {
      const { data } = await db.from('staff').select('*').eq('active', true).order('name');
      this.allStaff = data || [];
    },

    async toggleAdmin(staff) {
      const newVal = !staff.is_admin;
      const action = newVal ? '管理者に設定' : '管理者権限を削除';
      if (!confirm(`「${staff.name}」を${action}しますか？`)) {
        // チェックボックスを元に戻すため再読み込み
        await this.loadAllStaff();
        return;
      }
      const { error } = await db.from('staff')
        .update({ is_admin: newVal })
        .eq('id', staff.id);
      if (error) {
        alert('更新エラー: ' + error.message);
      } else {
        staff.is_admin = newVal;
      }
    },

    async onAnalysisMonthChange() {
      await this.$nextTick();
      this.drawCharts();
    },

    drawCharts() {
      this.drawBar();
      this.drawLine();
    },

    drawBar() {
      const monthIncs = this.allIncidents.filter(inc =>
        inc.incident_date?.startsWith(this.analysisMonth)
      );
      const catCnt = {};
      CATEGORIES.forEach(c => { catCnt[c.name] = 0; });
      monthIncs.forEach(inc => {
        (inc.category_ids || []).forEach(id => {
          const cat = CATEGORIES.find(c => c.id === id);
          if (cat) catCnt[cat.name]++;
        });
      });
      const labels = Object.keys(catCnt).filter(k => catCnt[k] > 0);
      const values = labels.map(k => catCnt[k]);
      if (this.barChartInst) this.barChartInst.destroy();
      const ctx = this.$refs.barChart;
      if (!ctx) return;
      this.barChartInst = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: '件数',
            data: values,
            backgroundColor: [
              '#1E88E5','#00897B','#E53935','#FB8C00',
              '#8E24AA','#43A047','#F4511E','#D81B60',
              '#6D4C41','#546E7A','#FFB300','#00ACC1',
            ].slice(0, labels.length),
            borderRadius: 5,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
            y: { ticks: { font: { size: 11 } } },
          },
        },
      });
    },

    drawLine() {
      const opts = [...this.monthOptions].reverse(); // 古い順
      const labels = opts.map(m => {
        const [y, mo] = m.value.split('-');
        return `${y}/${parseInt(mo)}`;
      });
      const values = opts.map(m =>
        this.allIncidents.filter(inc => inc.incident_date?.startsWith(m.value)).length
      );
      if (this.lineChartInst) this.lineChartInst.destroy();
      const ctx = this.$refs.lineChart;
      if (!ctx) return;
      this.lineChartInst = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: '件数',
            data: values,
            borderColor: '#00897B',
            backgroundColor: 'rgba(0,137,123,0.12)',
            fill: true, tension: 0.3, pointRadius: 5,
            pointBackgroundColor: '#00897B',
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
            x: { ticks: { font: { size: 11 } } },
          },
        },
      });
    },

    // ===== ユーティリティ =====
    catNames(ids) {
      if (!ids || ids.length === 0) return '（カテゴリ未選択）';
      return ids.map(id => {
        const cat = CATEGORIES.find(c => c.id === id);
        return cat ? cat.name : '';
      }).join('、');
    },

    fmtDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr + 'T00:00:00');
      return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    },
  },
}).mount('#app');

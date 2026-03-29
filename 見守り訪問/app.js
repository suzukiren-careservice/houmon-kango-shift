// =============================================
// 見守り訪問管理 - Vue 3 アプリ
// =============================================
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

const { createApp } = Vue;

createApp({
  data() {
    return {
      loading: true,

      // 認証
      appAuthenticated: false,
      appPassword: '',
      pwdInput: '',
      pwdError: false,

      // 表示中の月
      viewYear:  new Date().getFullYear(),
      viewMonth: new Date().getMonth() + 1, // 1〜12

      // タブ
      currentTab: 'schedule',

      // データ
      residents: [],
      visits: [],

      // ── 訪問詳細・記録モーダル ──
      visitModal: {
        show: false,
        visit: null,      // 表示中の訪問オブジェクト
        isEdit: false,    // 修正モードフラグ
        saving: false,
        // フォーム値
        bodyChange:        'none',
        bodyChangeDetail:  '',
        bodyConcern:       'none',
        bodyConcernDetail: '',
        hospitalVisit:     'none',
        hospitalDetail:    '',
        visitNotes:        '',
      },

      // ── 訪問スケジュール追加モーダル ──
      addVisitModal: {
        show: false,
        saving: false,
        residentId:    '',
        scheduledDate: '',
        scheduledTime: '',
      },

      // ── 利用者追加・編集モーダル ──
      residentModal: {
        show: false,
        isEdit: false,
        saving: false,
        id: null,
        name:             '',
        buildingName:     '',
        address:          '',
        roomNumber:       '',
        phone:            '',
        emergencyContact: '',
        notes:            '',
      },
    };
  },

  computed: {
    monthLabel() {
      return `${this.viewYear}年${this.viewMonth}月`;
    },

    totalCount() {
      return this.visits.length;
    },

    doneCount() {
      return this.visits.filter(v => v.visited).length;
    },

    activeResidents() {
      return this.residents.filter(r => r.active);
    },

    // 訪問を日付ごとにグループ化して返す
    visitsByDate() {
      const groups = {};
      for (const v of this.visits) {
        const key = v.scheduled_date;
        if (!groups[key]) groups[key] = [];
        groups[key].push(v);
      }
      // 日付内を時刻順にソート
      for (const key of Object.keys(groups)) {
        groups[key].sort((a, b) =>
          (a.scheduled_time || '99:99').localeCompare(b.scheduled_time || '99:99')
        );
      }
      return Object.keys(groups).sort().map(dateStr => {
        const d = new Date(dateStr + 'T00:00:00');
        const dow = d.getDay();
        return {
          dateStr,
          label: `${d.getDate()}日（${DAY_NAMES[dow]}）`,
          isWeekend: dow === 0 || dow === 6,
          visits: groups[dateStr],
        };
      });
    },
  },

  methods: {
    // ──────────────────────────────
    // 認証
    // ──────────────────────────────
    async checkPassword() {
      if (this.pwdInput === this.appPassword) {
        localStorage.setItem('welfare_visit_auth', this.appPassword);
        this.appAuthenticated = true;
        this.pwdError = false;
        await this.loadData();
      } else {
        this.pwdError = true;
      }
    },

    // ──────────────────────────────
    // 月ナビゲーション
    // ──────────────────────────────
    prevMonth() {
      if (this.viewMonth === 1) { this.viewMonth = 12; this.viewYear--; }
      else { this.viewMonth--; }
      this.loadVisits();
    },

    nextMonth() {
      if (this.viewMonth === 12) { this.viewMonth = 1; this.viewYear++; }
      else { this.viewMonth++; }
      this.loadVisits();
    },

    goToday() {
      const now = new Date();
      this.viewYear  = now.getFullYear();
      this.viewMonth = now.getMonth() + 1;
      this.loadVisits();
    },

    // ──────────────────────────────
    // データ読み込み
    // ──────────────────────────────
    async loadData() {
      await Promise.all([this.loadResidents(), this.loadVisits()]);
    },

    async loadResidents() {
      const { data, error } = await db
        .from('welfare_residents')
        .select('*')
        .order('name');
      if (!error) this.residents = data || [];
    },

    async loadVisits() {
      const y = this.viewYear;
      const m = String(this.viewMonth).padStart(2, '0');
      const firstDay = `${y}-${m}-01`;
      const lastDate  = new Date(y, this.viewMonth, 0).getDate();
      const lastDay   = `${y}-${m}-${String(lastDate).padStart(2, '0')}`;

      const { data, error } = await db
        .from('welfare_visits')
        .select('*, welfare_residents(name, address, room_number)')
        .gte('scheduled_date', firstDay)
        .lte('scheduled_date', lastDay)
        .order('scheduled_date')
        .order('scheduled_time');

      if (!error) {
        this.visits = (data || []).map(v => ({
          ...v,
          resident_name:     v.welfare_residents?.name          || '（不明）',
          resident_building: v.welfare_residents?.building_name || '',
          resident_address:  v.welfare_residents?.address       || '',
          resident_room:     v.welfare_residents?.room_number   || '',
        }));
      }
    },

    // ──────────────────────────────
    // 訪問詳細・記録モーダル
    // ──────────────────────────────
    openVisitModal(visit) {
      this.visitModal = {
        show:  true,
        visit: visit,
        isEdit: false,
        saving: false,
        bodyChange:        visit.body_change        || 'none',
        bodyChangeDetail:  visit.body_change_detail || '',
        bodyConcern:       visit.body_concern       || 'none',
        bodyConcernDetail: visit.body_concern_detail|| '',
        hospitalVisit:     visit.hospital_visit     || 'none',
        hospitalDetail:    visit.hospital_detail    || '',
        visitNotes:        visit.visit_notes        || '',
      };
    },

    closeVisitModal() {
      this.visitModal.show = false;
    },

    startEdit() {
      // 修正モードへ切り替え（フォーム値は openVisitModal 時にセット済み）
      this.visitModal.isEdit = true;
    },

    async saveVisitRecord() {
      this.visitModal.saving = true;
      const { error } = await db
        .from('welfare_visits')
        .update({
          visited:             true,
          visited_at:          new Date().toISOString(),
          body_change:         this.visitModal.bodyChange,
          body_change_detail:  this.visitModal.bodyChangeDetail,
          body_concern:        this.visitModal.bodyConcern,
          body_concern_detail: this.visitModal.bodyConcernDetail,
          hospital_visit:      this.visitModal.hospitalVisit,
          hospital_detail:     this.visitModal.hospitalDetail,
          visit_notes:         this.visitModal.visitNotes,
        })
        .eq('id', this.visitModal.visit.id);

      if (!error) {
        await this.loadVisits();
        this.visitModal.show = false;
      }
      this.visitModal.saving = false;
    },

    async deleteVisit() {
      if (!confirm('この訪問スケジュールを削除しますか？')) return;
      await db.from('welfare_visits').delete().eq('id', this.visitModal.visit.id);
      await this.loadVisits();
      this.visitModal.show = false;
    },

    // ──────────────────────────────
    // 訪問スケジュール追加モーダル
    // ──────────────────────────────
    openAddVisitModal() {
      if (this.activeResidents.length === 0) {
        alert('先に利用者を追加してください（「利用者管理」タブ）');
        this.currentTab = 'residents';
        return;
      }
      // デフォルト日付: 今月の1日
      const y = String(this.viewYear);
      const m = String(this.viewMonth).padStart(2, '0');
      this.addVisitModal = {
        show: true,
        saving: false,
        residentId:    this.activeResidents[0].id,
        scheduledDate: `${y}-${m}-01`,
        scheduledTime: '',
      };
    },

    closeAddVisitModal() {
      this.addVisitModal.show = false;
    },

    async saveAddVisit() {
      if (!this.addVisitModal.residentId || !this.addVisitModal.scheduledDate) return;
      this.addVisitModal.saving = true;

      const { error } = await db.from('welfare_visits').insert({
        resident_id:    this.addVisitModal.residentId,
        scheduled_date: this.addVisitModal.scheduledDate,
        scheduled_time: this.addVisitModal.scheduledTime,
        visited: false,
      });

      if (!error) {
        // 追加した訪問の月に表示を合わせる
        const d = new Date(this.addVisitModal.scheduledDate + 'T00:00:00');
        this.viewYear  = d.getFullYear();
        this.viewMonth = d.getMonth() + 1;
        await this.loadVisits();
        this.addVisitModal.show = false;
      }
      this.addVisitModal.saving = false;
    },

    // ──────────────────────────────
    // 利用者モーダル
    // ──────────────────────────────
    openAddResidentModal() {
      this.residentModal = {
        show: true, isEdit: false, saving: false, id: null,
        name: '', buildingName: '', address: '', roomNumber: '',
        phone: '', emergencyContact: '', notes: '',
      };
    },

    openEditResidentModal(r) {
      this.residentModal = {
        show: true, isEdit: true, saving: false, id: r.id,
        name:             r.name              || '',
        buildingName:     r.building_name     || '',
        address:          r.address           || '',
        roomNumber:       r.room_number       || '',
        phone:            r.phone             || '',
        emergencyContact: r.emergency_contact || '',
        notes:            r.notes             || '',
      };
    },

    closeResidentModal() {
      this.residentModal.show = false;
    },

    async saveResident() {
      if (!this.residentModal.name.trim()) return;
      this.residentModal.saving = true;

      const payload = {
        name:              this.residentModal.name.trim(),
        building_name:     this.residentModal.buildingName,
        address:           this.residentModal.address,
        room_number:       this.residentModal.roomNumber,
        phone:             this.residentModal.phone,
        emergency_contact: this.residentModal.emergencyContact,
        notes:             this.residentModal.notes,
      };

      if (this.residentModal.isEdit) {
        await db.from('welfare_residents').update(payload).eq('id', this.residentModal.id);
      } else {
        await db.from('welfare_residents').insert({ ...payload, active: true });
      }

      await this.loadResidents();
      this.residentModal.show   = false;
      this.residentModal.saving = false;
    },

    async deleteResident(id) {
      if (!confirm('この利用者を削除しますか？\n関連する訪問記録もすべて削除されます。')) return;
      await db.from('welfare_residents').delete().eq('id', id);
      await this.loadResidents();
      await this.loadVisits();
    },

    // ──────────────────────────────
    // ユーティリティ
    // ──────────────────────────────
    formatDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr + 'T00:00:00');
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${DAY_NAMES[d.getDay()]}）`;
    },

    formatVisitedAt(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())} 記録`;
    },
  },

  async mounted() {
    // このアプリ専用パスワード
    this.appPassword = 'Agepoyo12';

    // ローカルストレージに認証済みトークンがあれば自動ログイン
    const stored = localStorage.getItem('welfare_visit_auth');
    if (stored && stored === this.appPassword) {
      this.appAuthenticated = true;
      await this.loadData();
    }

    this.loading = false;
  },
}).mount('#app');

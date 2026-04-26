// ===== SUPABASE クライアント =====
const { createClient } = supabase;
const db  = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const db2 = createClient(OTHER_SUPABASE_URL, OTHER_SUPABASE_ANON_KEY); // 他チームDB

// ===== 定数 =====
const COLOR_OPTIONS = [
  '#E53935', '#8E24AA', '#1E88E5', '#00897B',
  '#43A047', '#F4511E', '#FB8C00', '#D81B60',
  '#6D4C41', '#546E7A',
];
const DAY_NAMES_JP = ['日', '月', '火', '水', '木', '金', '土'];

// ===== Vue アプリ =====
const { createApp } = Vue;

createApp({
  data() {
    return {
      loading: true,
      // パスワード認証
      appAuthenticated: false,
      appPassword: '',
      pwdInput: '',
      pwdError: false,
      // スタッフログイン
      currentStaff: null,
      currentTab: 'schedule',
      tabs: [
        { id: 'schedule', label: '週間スケジュール' },
        { id: 'clientview', label: '利用者確認' },
        { id: 'clients',  label: '利用者管理' },
      ],
      colorOptions: COLOR_OPTIONS,
      weekOffset: 0,

      staffList:  [],
      clientList: [],
      shifts:     {},
      visits:     [],
      crossConflicts:  {}, // 他チームの同日訪問マップ {正規化名_日付: true}
      otherTeamLabel: OTHER_TEAM_LABEL,

      visitModal: {
        show: false, isEdit: false, visitId: null,
        staffId: '', staffName: '', dateStr: '', dateLabel: '',
        period: 'morning', clientId: '', clientNotes: '',
        location: '', startTime: '', endTime: '', notes: '',
      },
      staffModal: {
        show: false, isEdit: false, staffId: null,
        name: '', color: COLOR_OPTIONS[0], active: true,
      },
      clientModal: {
        show: false, isEdit: false, clientId: null,
        name: '', address: '', notes: '', weeklyVisits: null, freqType: 'week',
      },
      clientViewFilter: 'all', // 'all' | 'active' | 'warn'
      clientViewPeriod: 'week', // 'week' | 'longterm'
    };
  },

  computed: {
    isAdmin() {
      return this.currentStaff?.is_admin === true;
    },

    weekStart() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dow = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((dow + 6) % 7) + this.weekOffset * 7);
      return monday;
    },

    weekDays() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(this.weekStart);
        d.setDate(this.weekStart.getDate() + i);
        const dow = d.getDay();
        return {
          date: d,
          dateStr: this.formatDateStr(d),
          dayName: DAY_NAMES_JP[dow] + '曜日',
          shortDate: `${d.getMonth() + 1}/${d.getDate()}`,
          isToday: d.getTime() === today.getTime(),
          isWeekend: dow === 0 || dow === 6,
        };
      });
    },

    weekLabel() {
      const s = this.weekStart;
      const e = new Date(s); e.setDate(s.getDate() + 6);
      return `${s.getFullYear()}年 ${s.getMonth()+1}月${s.getDate()}日（月）〜 ${e.getMonth()+1}月${e.getDate()}日（日）`;
    },

    activeStaff() {
      return this.staffList.filter(s => s.active);
    },

    // 利用者確認ビュー用（週次・1日複数回）
    clientViewRows() {
      return this.clientList.filter(c => c.freqType === 'week' || c.freqType === 'daily' || (!c.freqType)).map(client => {
        const days = this.weekDays.map(day => {
          const dayVisits = this.visits.filter(v =>
            v.clientId === client.id && v.date === day.dateStr
          );
          const dayCount = dayVisits.length;
          let dayStatus = 'none';
          if (client.freqType === 'daily' && client.weeklyVisits) {
            dayStatus = dayCount >= client.weeklyVisits ? 'ok'
                      : dayCount > 0 ? 'partial' : 'empty';
          }
          return {
            dateStr: day.dateStr,
            isToday: day.isToday,
            dayCount,
            dayStatus,
            visits: dayVisits.map(v => {
              const staff = this.staffList.find(s => s.id === v.staffId);
              return { ...v, staffName: staff?.name || '?', staffColor: staff?.color || '#999' };
            }),
          };
        });
        const weekCount = days.reduce((sum, d) => sum + d.dayCount, 0);
        const expected = client.weeklyVisits;
        let status = 'none';
        if (client.onHold) {
          status = 'hold';
        } else if (client.freqType === 'daily' && expected) {
          status = days.some(d => d.dayCount < expected) ? 'warn' : 'ok';
        } else if (expected) {
          status = weekCount >= expected ? 'ok' : 'warn';
        }
        return { client, days, weekCount, expected, status };
      }).filter(row => {
        if (this.clientViewFilter === 'active') return row.weekCount > 0;
        if (this.clientViewFilter === 'warn')   return row.status === 'warn';
        return true;
      });
    },

    // 不定期確認ビュー用
    clientViewLongtermRows() {
      return this.clientList.filter(c => c.freqType === 'irregular').map(client => {
        const days = this.weekDays.map(day => {
          const dayVisits = this.visits.filter(v =>
            v.clientId === client.id && v.date === day.dateStr
          );
          return {
            dateStr: day.dateStr,
            isToday: day.isToday,
            dayCount: dayVisits.length,
            visits: dayVisits.map(v => {
              const staff = this.staffList.find(s => s.id === v.staffId);
              return { ...v, staffName: staff?.name || '?', staffColor: staff?.color || '#999' };
            }),
          };
        });
        const weekCount = days.reduce((sum, d) => sum + d.dayCount, 0);
        return { client, days, weekCount };
      });
    },

    clientViewWarnCount() {
      const weekWarn = this.clientViewRows.filter(r => r.status === 'warn').length;
      const ltWarn   = 0;
      return weekWarn + ltWarn;
    },

    // 常に10行以上表示（空スロットでパディング）
    staffSlots() {
      const active = this.staffList.filter(s => s.active);
      const result = [...active];
      const target = Math.max(10, active.length);
      let i = 0;
      while (result.length < target) {
        result.push({ id: `_empty_${i++}`, isEmpty: true });
      }
      return result;
    },

    // 午前：06:00〜12:00 の5分刻み
    morningTimeOptions() {
      const opts = [];
      for (let h = 6; h <= 12; h++) {
        for (let m = 0; m < 60; m += 5) {
          if (h === 12 && m > 0) break;
          opts.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
        }
      }
      return opts;
    },

    // 午後：12:00〜20:00 の5分刻み
    afternoonTimeOptions() {
      const opts = [];
      for (let h = 12; h <= 20; h++) {
        for (let m = 0; m < 60; m += 5) {
          if (h === 20 && m > 0) break;
          opts.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
        }
      }
      return opts;
    },

    // モーダルで使う時刻オプション（period に応じて切り替え）
    currentTimeOptions() {
      return this.visitModal.period === 'morning'
        ? this.morningTimeOptions
        : this.afternoonTimeOptions;
    },
  },

  methods: {
    // ===== 日付ヘルパー =====
    formatDateStr(date) {
      return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    },
    formatDateJp(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      return `${d.getMonth()+1}月${d.getDate()}日（${DAY_NAMES_JP[d.getDay()]}）`;
    },
    isWeekend(dateStr) {
      const dow = new Date(dateStr + 'T00:00:00').getDay();
      return dow === 0 || dow === 6;
    },

    // ===== パスワード認証 =====
    async checkPassword() {
      if (!this.pwdInput) return;
      if (this.pwdInput === this.appPassword) {
        localStorage.setItem('rehab_app_auth', this.appPassword);
        this.appAuthenticated = true;
        this.pwdError = false;
        this.pwdInput = '';
        const savedStaff = localStorage.getItem('rehab_staff');
        if (savedStaff) {
          try { this.currentStaff = JSON.parse(savedStaff); } catch {}
        }
        await this.loadAllData();
        if (this.currentStaff) {
          const fresh = this.staffList.find(s => s.id === this.currentStaff.id);
          if (fresh) this.currentStaff = fresh;
        }
      } else {
        this.pwdError = true;
        this.pwdInput = '';
      }
    },

    selectStaff(staff) {
      this.currentStaff = staff;
      localStorage.setItem('rehab_staff', JSON.stringify(staff));
    },

    logoutStaff() {
      this.currentStaff = null;
      localStorage.removeItem('rehab_staff');
    },

    // ===== データ読み込み =====
    async loadAllData() {
      this.loading = true;
      try {
        const [
          { data: staffData,  error: e1 },
          { data: clientData, error: e2 },
          { data: shiftData,  error: e3 },
          { data: visitData,  error: e4 },
        ] = await Promise.all([
          db.from('staff').select('*').order('sort_order', { ascending: true, nullsFirst: false }),
          db.from('clients').select('*').order('created_at'),
          db.from('shifts').select('*'),
          db.from('visits').select('*').order('created_at'),
        ]);
        if (e1 || e2 || e3 || e4) throw (e1 || e2 || e3 || e4);

        this.staffList  = (staffData  || []).map(s => ({ id: s.id, name: s.name, color: s.color, active: s.active, is_admin: s.is_admin }));
        this.clientList = (clientData || []).map(c => ({ id: c.id, name: c.name, address: c.address || '', notes: c.notes || '', weeklyVisits: c.weekly_visits || null, freqType: c.freq_type || 'week', onHold: c.on_hold || false }));
        this.sortClients();

        this.shifts = {};
        (shiftData || []).forEach(s => {
          this.shifts[`${s.staff_id}_${s.date}`] = { morning: s.morning, afternoon: s.afternoon };
        });

        this.visits = (visitData || []).map(v => ({
          id:        v.id,
          staffId:   v.staff_id,
          clientId:  v.client_id,
          date:      v.date,
          period:    v.period,
          location:  v.location   || '',
          startTime: v.start_time || '',
          endTime:   v.end_time   || '',
          notes:     v.notes      || '',
          order:     v.order      || 0,
        }));

        // ===== 他チームの同日訪問チェック =====
        try {
          const [{ data: otherVisits }, { data: otherClients }] = await Promise.all([
            db2.from('visits').select('client_id, date'),
            db2.from('clients').select('id, name'),
          ]);
          const nameMap = {};
          (otherClients || []).forEach(c => {
            nameMap[c.id] = c.name.replace(/[\s　]/g, ''); // 半角・全角スペース除去
          });
          const conflicts = {};
          (otherVisits || []).forEach(v => {
            const name = nameMap[v.client_id];
            if (name) conflicts[`${name}_${v.date}`] = true;
          });
          this.crossConflicts = conflicts;
        } catch(e) {
          console.warn('他チームデータ取得エラー（無視）:', e);
        }

      } catch (e) {
        console.error('データ読み込みエラー:', e);
        alert('データの読み込みに失敗しました。\nconfig.js の Supabase 設定を確認してください。');
      } finally {
        this.loading = false;
      }
    },

    // ===== シフト =====
    getShift(staffId, dateStr) {
      const key = `${staffId}_${dateStr}`;
      if (this.shifts[key] !== undefined) return this.shifts[key];
      const isWe = this.isWeekend(dateStr);
      return { morning: !isWe, afternoon: !isWe };
    },

    async toggleShift(staffId, dateStr, period) {
      const current = this.getShift(staffId, dateStr);
      const next = { ...current, [period]: !current[period] };
      const key = `${staffId}_${dateStr}`;
      this.shifts = { ...this.shifts, [key]: next }; // 楽観的更新
      try {
        const { error } = await db.from('shifts').upsert(
          { staff_id: staffId, date: dateStr, morning: next.morning, afternoon: next.afternoon },
          { onConflict: 'staff_id,date' }
        );
        if (error) throw error;
      } catch (e) {
        this.shifts = { ...this.shifts, [key]: current }; // ロールバック
        alert('シフトの更新に失敗しました');
      }
    },

    // ===== 訪問 =====
    getVisits(staffId, dateStr, period) {
      return this.visits
        .filter(v => v.staffId === staffId && v.date === dateStr && v.period === period)
        .sort((a, b) => {
          if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
          if (a.startTime) return -1;
          if (b.startTime) return  1;
          return (a.order || 0) - (b.order || 0);
        });
    },
    getClientName(clientId) {
      return this.clientList.find(c => c.id === clientId)?.name || '（利用者不明）';
    },
    getClient(clientId) {
      return this.clientList.find(c => c.id === clientId) || null;
    },
    hasCrossConflict(clientId, dateStr) {
      const client = this.clientList.find(c => c.id === clientId);
      if (!client) return false;
      const key = `${client.name.replace(/[\s　]/g, '')}_${dateStr}`;
      return !!this.crossConflicts[key];
    },

    openAddVisit(staffId, dateStr, period) {
      const staff = this.staffList.find(s => s.id === staffId);
      this.visitModal = {
        show: true, isEdit: false, visitId: null,
        staffId, staffName: staff?.name || '',
        dateStr, dateLabel: this.formatDateJp(dateStr),
        period, clientId: '', clientNotes: '',
        location: '', startTime: '', endTime: '', notes: '',
      };
    },
    openEditVisit(visit) {
      const staff  = this.staffList.find(s => s.id === visit.staffId);
      const client = this.getClient(visit.clientId);
      this.visitModal = {
        show: true, isEdit: true, visitId: visit.id,
        staffId: visit.staffId, staffName: staff?.name || '',
        dateStr: visit.date, dateLabel: this.formatDateJp(visit.date),
        period: visit.period, clientId: visit.clientId,
        clientNotes: client?.notes || '',
        location: visit.location || '', startTime: visit.startTime || '', endTime: visit.endTime || '', notes: visit.notes || '',
      };
    },
    onVisitClientChange() {
      const client = this.getClient(this.visitModal.clientId);
      this.visitModal.clientNotes = client?.notes || '';
      if (!this.visitModal.location && client?.address) {
        this.visitModal.location = client.address;
      }
    },

    async saveVisit() {
      if (!this.visitModal.clientId) { alert('利用者を選択してください。'); return; }
      const payload = {
        staff_id:   this.visitModal.staffId,
        client_id:  this.visitModal.clientId,
        date:       this.visitModal.dateStr,
        period:     this.visitModal.period,
        location:   this.visitModal.location,
        start_time: this.visitModal.startTime,
        end_time:   this.visitModal.endTime,
        notes:      this.visitModal.notes,
      };
      try {
        if (this.visitModal.isEdit) {
          const { error } = await db.from('visits').update(payload).eq('id', this.visitModal.visitId);
          if (error) throw error;
          const idx = this.visits.findIndex(v => v.id === this.visitModal.visitId);
          if (idx !== -1) this.visits.splice(idx, 1, {
            ...this.visits[idx],
            clientId: payload.client_id, location: payload.location,
            startTime: payload.start_time, endTime: payload.end_time, notes: payload.notes,
          });
        } else {
          const order = this.getVisits(payload.staff_id, payload.date, payload.period).length;
          const { data, error } = await db.from('visits').insert({ ...payload, order }).select().single();
          if (error) throw error;
          this.visits.push({
            id: data.id, staffId: data.staff_id, clientId: data.client_id,
            date: data.date, period: data.period,
            location: data.location || '', startTime: data.start_time || '',
            endTime: data.end_time || '', notes: data.notes || '', order: data.order || 0,
          });
        }
      } catch (e) {
        console.error(e); alert('訪問の保存に失敗しました'); return;
      }
      this.closeVisitModal();
    },

    async deleteVisit() {
      if (!confirm('この訪問を削除しますか？')) return;
      try {
        const { error } = await db.from('visits').delete().eq('id', this.visitModal.visitId);
        if (error) throw error;
        this.visits = this.visits.filter(v => v.id !== this.visitModal.visitId);
      } catch (e) { alert('削除に失敗しました'); return; }
      this.closeVisitModal();
    },
    closeVisitModal() { this.visitModal.show = false; },

    // ===== スタッフ =====
    openAddStaff() {
      this.staffModal = {
        show: true, isEdit: false, staffId: null,
        name: '', color: COLOR_OPTIONS[this.staffList.length % COLOR_OPTIONS.length], active: true,
      };
    },
    openEditStaff(staff) {
      this.staffModal = { show: true, isEdit: true, staffId: staff.id, name: staff.name, color: staff.color, active: staff.active };
    },
    async saveStaff() {
      if (!this.staffModal.name.trim()) { alert('スタッフ名を入力してください。'); return; }
      const payload = { name: this.staffModal.name.trim(), color: this.staffModal.color, active: this.staffModal.active };
      try {
        if (this.staffModal.isEdit) {
          const { error } = await db.from('staff').update(payload).eq('id', this.staffModal.staffId);
          if (error) throw error;
          const idx = this.staffList.findIndex(s => s.id === this.staffModal.staffId);
          if (idx !== -1) this.staffList.splice(idx, 1, { id: this.staffModal.staffId, ...payload });
        } else {
          const { data, error } = await db.from('staff').insert(payload).select().single();
          if (error) throw error;
          this.staffList.push({ id: data.id, ...payload });
        }
      } catch (e) { alert('スタッフの保存に失敗しました'); return; }
      this.closeStaffModal();
    },
    async deleteStaff(staff) {
      if (!confirm(`「${staff.name}」を削除しますか？\n関連する訪問データも削除されます。`)) return;
      try {
        const { error } = await db.from('staff').delete().eq('id', staff.id);
        if (error) throw error;
        this.staffList = this.staffList.filter(s => s.id !== staff.id);
        this.visits    = this.visits.filter(v => v.staffId !== staff.id);
      } catch (e) { alert('削除に失敗しました'); }
    },
    closeStaffModal() { this.staffModal.show = false; },

    // ===== 利用者 =====
    openAddClient() {
      this.clientModal = { show: true, isEdit: false, clientId: null, name: '', address: '', notes: '', weeklyVisits: null, freqType: 'week', onHold: false };
    },
    openEditClient(client) {
      this.clientModal = { show: true, isEdit: true, clientId: client.id, name: client.name, address: client.address || '', notes: client.notes || '', weeklyVisits: client.weeklyVisits || null, freqType: client.freqType || 'week', onHold: client.onHold || false };
    },
    async saveClient() {
      if (!this.clientModal.name.trim()) { alert('利用者名を入力してください。'); return; }
      const wv = this.clientModal.weeklyVisits ? parseInt(this.clientModal.weeklyVisits) : null;
      const payload = { name: this.clientModal.name.trim(), address: this.clientModal.address.trim(), notes: this.clientModal.notes.trim(), weekly_visits: wv, freq_type: this.clientModal.freqType || 'week', on_hold: this.clientModal.onHold || false };
      try {
        if (this.clientModal.isEdit) {
          const { error } = await db.from('clients').update(payload).eq('id', this.clientModal.clientId);
          if (error) throw error;
          const idx = this.clientList.findIndex(c => c.id === this.clientModal.clientId);
          if (idx !== -1) this.clientList.splice(idx, 1, { id: this.clientModal.clientId, ...this.clientList[idx], name: payload.name, address: payload.address, notes: payload.notes, weeklyVisits: wv, freqType: payload.freq_type, onHold: payload.on_hold });
        } else {
          const { data, error } = await db.from('clients').insert(payload).select().single();
          if (error) throw error;
          this.clientList.push({ id: data.id, name: data.name, address: data.address, notes: data.notes, weeklyVisits: data.weekly_visits, freqType: data.freq_type || 'week', onHold: data.on_hold || false });
        }
      } catch (e) { alert('利用者の保存に失敗しました'); return; }
      this.sortClients();
      this.closeClientModal();
    },
    sortClients() {
      this.clientList.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    },
    async deleteClient(client) {
      if (!confirm(`「${client.name}」を削除しますか？\n関連する訪問データも削除されます。`)) return;
      try {
        const { error } = await db.from('clients').delete().eq('id', client.id);
        if (error) throw error;
        this.clientList = this.clientList.filter(c => c.id !== client.id);
        this.visits     = this.visits.filter(v => v.clientId !== client.id);
      } catch (e) { alert('削除に失敗しました'); }
    },
    closeClientModal() { this.clientModal.show = false; },

    // ===== 週ナビ / 印刷 =====
    prevWeek()     { this.weekOffset--; },
    nextWeek()     { this.weekOffset++; },
    goToday()      { this.weekOffset = 0; },
    printSchedule(){ window.print(); },
  },

  async mounted() {
    const { data: pwdData } = await db.from('settings').select('value').eq('key', 'app_password').single();
    this.appPassword = pwdData?.value || '';
    const storedAuth = localStorage.getItem('rehab_app_auth');
    if (storedAuth && storedAuth === this.appPassword) {
      this.appAuthenticated = true;
      const savedStaff = localStorage.getItem('rehab_staff');
      if (savedStaff) {
        try { this.currentStaff = JSON.parse(savedStaff); } catch {}
      }
      await this.loadAllData();
      if (this.currentStaff) {
        const fresh = this.staffList.find(s => s.id === this.currentStaff.id);
        if (fresh) this.currentStaff = fresh;
      }
    } else {
      this.loading = false;
    }
  },
}).mount('#app');

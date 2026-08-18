// ===== SUPABASE クライアント =====
const { createClient } = supabase;
const db  = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const db2 = createClient(OTHER_SUPABASE_URL, OTHER_SUPABASE_ANON_KEY);

// ===== 定数 =====
const COLOR_OPTIONS = [
  '#E53935','#8E24AA','#1E88E5','#00897B',
  '#43A047','#F4511E','#FB8C00','#D81B60',
  '#6D4C41','#546E7A',
];
const DAY_NAMES_JP = ['日','月','火','水','木','金','土'];

const SPECIAL_TASKS = [
  { id:'bath',      label:'入浴',         category:'hygiene'   },
  { id:'shower',    label:'シャワー',     category:'hygiene'   },
  { id:'wipe',      label:'清拭',         category:'hygiene'   },
  { id:'hair',      label:'洗髪',         category:'hygiene'   },
  { id:'meds',      label:'内服セット',   category:'medical'   },
  { id:'blood',     label:'採血',         category:'medical'   },
  { id:'iv',        label:'点滴',         category:'medical'   },
  { id:'treatment', label:'処置',         category:'medical'   },
  { id:'lock',      label:'ロック',       category:'medical'   },
  { id:'pressure',  label:'褥瘡評価',     category:'procedure' },
  { id:'stoma',     label:'ストーマ',     category:'procedure' },
  { id:'bladder',   label:'膀胱洗浄',     category:'procedure' },
  { id:'catheter',  label:'バルーン交換', category:'procedure' },
];

const TL_PX_PER_MIN = 1.5; // 1分=1.5px → 90px/h（30分訪問でも名前＋作業バッジを表示可能）
const TL_START_H = 8;
const TL_END_H   = 18;

// ===== Vue アプリ =====
const { createApp } = Vue;

createApp({
  data() {
    return {
      loading: true,
      appAuthenticated: false,
      appPassword: '',
      pwdInput: '',
      pwdError: false,
      currentStaff: null,
      currentTab: 'timeline',
      tabs: [
        { id: 'timeline',   label: 'タイムライン' },
        { id: 'clientview', label: '利用者確認' },
        { id: 'clients',    label: '利用者管理' },
      ],
      colorOptions: COLOR_OPTIONS,
      specialTasks: SPECIAL_TASKS,
      weekOffset: 0,
      timelineDate: '',

      staffList:  [],
      clientList: [],
      shifts:     {},
      visits:     [],
      crossConflicts:  {},
      otherTeamLabel: OTHER_TEAM_LABEL,

      visitModal: {
        show: false, isEdit: false, visitId: null,
        staffId: '', staffName: '', dateStr: '', dateLabel: '',
        period: 'morning', clientId: '', clientNotes: '',
        location: '', startTime: '', endTime: '', notes: '',
        specialTasks: [],
      },
      staffModal: {
        show: false, isEdit: false, staffId: null,
        name: '', color: COLOR_OPTIONS[0], active: true,
      },
      clientModal: {
        show: false, isEdit: false, clientId: null,
        name: '', address: '', notes: '', weeklyVisits: null,
        freqType: 'week', onHold: false,
        specialTasks: [], areaColor: '',
      },
      now: new Date(),
      mapModal: { show: false },
      printModal: { show: false, weekOffset: 0 },
      bulkModal: {
        show: false,
        clientId: '',
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        selectedDates: [],
        staffMode: 'single',
        staffId: '',
        perDayStaff: {},
        startTime: '',
        endTime: '',
        saving: false,
      },
      clientViewFilter: 'all',
      clientViewPeriod: 'week',
    };
  },

  computed: {
    isAdmin() { return this.currentStaff?.is_admin === true; },

    weekStart() {
      const today = new Date(); today.setHours(0,0,0,0);
      const dow = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((dow+6)%7) + this.weekOffset*7);
      return monday;
    },

    weekDays() {
      const today = new Date(); today.setHours(0,0,0,0);
      return Array.from({length:7}, (_,i) => {
        const d = new Date(this.weekStart); d.setDate(this.weekStart.getDate()+i);
        const dow = d.getDay();
        return {
          date: d, dateStr: this.formatDateStr(d),
          dayName: DAY_NAMES_JP[dow]+'曜日',
          shortDate: `${d.getMonth()+1}/${d.getDate()}`,
          isToday: d.getTime()===today.getTime(),
          isWeekend: dow===0||dow===6,
        };
      });
    },

    weekLabel() {
      const s = this.weekStart;
      const e = new Date(s); e.setDate(s.getDate()+6);
      return `${s.getFullYear()}年 ${s.getMonth()+1}月${s.getDate()}日（月）〜 ${e.getMonth()+1}月${e.getDate()}日（日）`;
    },

    printWeekStart() {
      const today = new Date(); today.setHours(0,0,0,0);
      const dow = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((dow+6)%7) + this.printModal.weekOffset*7);
      return monday;
    },
    printWeekDays() {
      const today = new Date(); today.setHours(0,0,0,0);
      return Array.from({length:7}, (_,i) => {
        const d = new Date(this.printWeekStart); d.setDate(this.printWeekStart.getDate()+i);
        const dow = d.getDay();
        return {
          date: d, dateStr: this.formatDateStr(d),
          dayName: DAY_NAMES_JP[dow]+'曜日',
          shortDate: `${d.getMonth()+1}/${d.getDate()}`,
          isToday: d.getTime()===today.getTime(),
          isWeekend: dow===0||dow===6,
        };
      });
    },
    printWeekLabel() {
      const s = this.printWeekStart;
      const e = new Date(s); e.setDate(s.getDate()+6);
      return `${s.getFullYear()}年 ${s.getMonth()+1}月${s.getDate()}日〜${e.getMonth()+1}月${e.getDate()}日`;
    },

    activeStaff() { return this.staffList.filter(s => s.active); },

    activeEmergencies() {
      return this.visits.filter(v => {
        if (!v.isEmergency) return false;
        if (v.date !== this.timelineDate) return false;
        if (!v.endTime) return true;
        const [eh,em]=v.endTime.split(':').map(Number);
        const end=new Date(this.timelineDate);
        end.setHours(eh,em,0,0);
        return end > this.now;
      });
    },

    tlHours() {
      const hours = [];
      for (let h = TL_START_H; h <= TL_END_H; h++) hours.push(h);
      return hours;
    },

    tlTotalHeight() {
      return (TL_END_H - TL_START_H) * 60 * TL_PX_PER_MIN;
    },

    tlDateLabel() {
      if (!this.timelineDate) return '';
      const d = new Date(this.timelineDate + 'T00:00:00');
      return `${d.getMonth()+1}月${d.getDate()}日（${DAY_NAMES_JP[d.getDay()]}）`;
    },

    bulkMonthLabel() {
      return `${this.bulkModal.year}年 ${this.bulkModal.month+1}月`;
    },

    bulkCalDays() {
      const { year, month } = this.bulkModal;
      const first = new Date(year, month, 1);
      const last  = new Date(year, month+1, 0);
      const days  = [];
      for (let i = 0; i < first.getDay(); i++) days.push(null);
      for (let d = 1; d <= last.getDate(); d++) {
        const date = new Date(year, month, d);
        days.push({ date: d, dateStr: this.formatDateStr(date), dow: date.getDay() });
      }
      return days;
    },

    clientViewRows() {
      return this.clientList.filter(c => c.freqType==='week'||c.freqType==='daily').map(client => {
        const days = this.weekDays.map(day => {
          const dayVisits = this.visits.filter(v => v.clientId===client.id&&v.date===day.dateStr);
          const dayCount  = dayVisits.length;
          let dayStatus = 'none';
          if (client.freqType==='daily'&&client.weeklyVisits) {
            dayStatus = dayCount>=client.weeklyVisits ? 'ok' : dayCount>0 ? 'partial' : 'empty';
          }
          return {
            dateStr: day.dateStr, isToday: day.isToday, dayCount, dayStatus,
            visits: dayVisits.map(v => {
              const staff = this.staffList.find(s=>s.id===v.staffId);
              return {...v, staffName:staff?.name||'?', staffColor:staff?.color||'#999'};
            }),
          };
        });
        const weekCount = days.reduce((sum,d)=>sum+d.dayCount, 0);
        const expected  = client.weeklyVisits;
        let status = 'none';
        if (client.onHold) status='hold';
        else if (client.freqType==='daily'&&expected) status=days.some(d=>d.dayCount<expected)?'warn':'ok';
        else if (expected) status=weekCount>=expected?'ok':'warn';
        return {client, days, weekCount, expected, status};
      }).filter(row => {
        if (this.clientViewFilter==='active') return row.weekCount>0;
        if (this.clientViewFilter==='warn')   return row.status==='warn';
        return true;
      });
    },

    clientViewLongtermRows() {
      const now = new Date();
      const ym  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      return this.clientList.filter(c=>c.freqType==='month'||c.freqType==='bimonth'||c.freqType==='quarter').map(client => {
        const allVisits = this.visits.filter(v=>v.clientId===client.id&&v.date).map(v=>v.date).sort().reverse();
        const lastVisitDate = allVisits[0]||null;
        let visitCount=0, nextDueDateStr=null, status='none';
        if (client.freqType==='month') {
          visitCount = this.visits.filter(v=>v.clientId===client.id&&v.date.startsWith(ym)).length;
          if (client.weeklyVisits) status=visitCount>=client.weeklyVisits?'ok':'warn';
        } else {
          const intv = client.freqType==='bimonth'?2:3;
          if (lastVisitDate) {
            const nextDue = new Date(lastVisitDate+'T00:00:00');
            nextDue.setMonth(nextDue.getMonth()+intv);
            nextDueDateStr = this.formatDateStr(nextDue);
            status = now>=nextDue?'warn':'ok';
          } else status='warn';
        }
        if (client.onHold) status='hold';
        return {client, visitCount, expected:client.freqType==='month'?client.weeklyVisits:null, lastVisitDate, nextDueDateStr, status};
      }).filter(row => {
        if (this.clientViewFilter==='warn') return row.status==='warn';
        return true;
      });
    },

    clientViewWarnCount() {
      return this.clientViewRows.filter(r=>r.status==='warn').length
           + this.clientViewLongtermRows.filter(r=>r.status==='warn').length;
    },

    staffSlots() {
      const active = this.staffList.filter(s=>s.active);
      const result = [...active];
      const target = Math.max(10, active.length);
      let i=0;
      while (result.length<target) result.push({id:`_empty_${i++}`, isEmpty:true});
      return result;
    },

    morningTimeOptions() {
      const opts=[];
      for (let h=6; h<=12; h++) for (let m=0; m<60; m+=5) {
        if (h===12&&m>0) break;
        opts.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
      }
      return opts;
    },

    afternoonTimeOptions() {
      const opts=[];
      for (let h=12; h<=20; h++) for (let m=0; m<60; m+=5) {
        if (h===20&&m>0) break;
        opts.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
      }
      return opts;
    },

    currentTimeOptions() {
      return this.visitModal.period==='morning' ? this.morningTimeOptions : this.afternoonTimeOptions;
    },

    allTimeOptions() {
      const opts=[];
      for (let h=0; h<24; h++) for (let m=0; m<60; m+=5)
        opts.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
      return opts;
    },
  },

  methods: {
    // ===== 日付ヘルパー =====
    formatDateStr(date) {
      return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    },
    formatDateJp(dateStr) {
      const d = new Date(dateStr+'T00:00:00');
      return `${d.getMonth()+1}月${d.getDate()}日（${DAY_NAMES_JP[d.getDay()]}）`;
    },
    isWeekend(dateStr) {
      const dow = new Date(dateStr+'T00:00:00').getDay();
      return dow===0||dow===6;
    },

    // ===== パスワード認証 =====
    async checkPassword() {
      if (!this.pwdInput) return;
      if (this.pwdInput===this.appPassword) {
        localStorage.setItem('app_auth', this.appPassword);
        this.appAuthenticated=true; this.pwdError=false; this.pwdInput='';
        const savedStaff=localStorage.getItem('incident_staff');
        if (savedStaff) { try { this.currentStaff=JSON.parse(savedStaff); } catch {} }
        await this.loadAllData();
        if (this.currentStaff) {
          const fresh=this.staffList.find(s=>s.id===this.currentStaff.id);
          if (fresh) this.currentStaff=fresh;
        }
      } else { this.pwdError=true; this.pwdInput=''; }
    },
    selectStaff(staff) { this.currentStaff=staff; localStorage.setItem('incident_staff',JSON.stringify(staff)); },
    logoutStaff() { this.currentStaff=null; localStorage.removeItem('incident_staff'); },

    // ===== データ読み込み =====
    async loadAllData() {
      this.loading=true;
      try {
        const [
          {data:staffData,  error:e1},
          {data:clientData, error:e2},
          {data:shiftData,  error:e3},
          {data:visitData,  error:e4},
        ] = await Promise.all([
          db.from('staff').select('*').order('sort_order',{ascending:true,nullsFirst:false}),
          db.from('clients').select('*').order('created_at'),
          db.from('shifts').select('*'),
          db.from('visits').select('*').order('created_at'),
        ]);
        if (e1||e2||e3||e4) throw (e1||e2||e3||e4);

        this.staffList  = (staffData||[]).map(s=>({
          id:s.id, name:s.name, color:s.color, active:s.active, is_admin:s.is_admin,
        }));
        this.clientList = (clientData||[]).map(c=>({
          id:c.id, name:c.name, address:c.address||'', notes:c.notes||'',
          weeklyVisits:c.weekly_visits||null, freqType:c.freq_type||'week',
          onHold:c.on_hold||false,
          specialTasks:Array.isArray(c.special_tasks)?c.special_tasks:[],
          areaColor:c.area_color||'',
        }));
        this.sortClients();

        this.shifts={};
        (shiftData||[]).forEach(s=>{
          this.shifts[`${s.staff_id}_${s.date}`]={morning:s.morning,afternoon:s.afternoon};
        });

        this.visits=(visitData||[]).map(v=>({
          id:v.id, staffId:v.staff_id, clientId:v.client_id,
          date:v.date, period:v.period,
          location:v.location||'', startTime:v.start_time||'', endTime:v.end_time||'',
          notes:v.notes||'', order:v.order||0,
          specialTasks:Array.isArray(v.special_tasks)?v.special_tasks:[],
          isEmergency:v.is_emergency||false,
        }));

        await this.loadCrossTeamData();
      } catch(e) {
        console.error('データ読み込みエラー:', e);
        alert('データの読み込みに失敗しました。\nconfig.js の Supabase 設定を確認してください。');
      } finally { this.loading=false; }
    },

    // ===== シフト =====
    getShift(staffId, dateStr) {
      const key=`${staffId}_${dateStr}`;
      if (this.shifts[key]!==undefined) return this.shifts[key];
      const isWe=this.isWeekend(dateStr);
      return {morning:!isWe, afternoon:!isWe};
    },

    async toggleShiftAll(staffId, dateStr) {
      const current=this.getShift(staffId,dateStr);
      const bothOff=!current.morning&&!current.afternoon;
      const next={morning:bothOff, afternoon:bothOff};
      const key=`${staffId}_${dateStr}`;
      this.shifts={...this.shifts,[key]:next};
      try {
        const {error}=await db.from('shifts').upsert(
          {staff_id:staffId,date:dateStr,morning:next.morning,afternoon:next.afternoon},
          {onConflict:'staff_id,date'}
        );
        if (error) throw error;
      } catch(e) { this.shifts={...this.shifts,[key]:current}; alert('シフトの更新に失敗しました'); }
    },

    async toggleShift(staffId, dateStr, period) {
      const current=this.getShift(staffId,dateStr);
      const next={...current,[period]:!current[period]};
      const key=`${staffId}_${dateStr}`;
      this.shifts={...this.shifts,[key]:next};
      try {
        const {error}=await db.from('shifts').upsert(
          {staff_id:staffId,date:dateStr,morning:next.morning,afternoon:next.afternoon},
          {onConflict:'staff_id,date'}
        );
        if (error) throw error;
      } catch(e) { this.shifts={...this.shifts,[key]:current}; alert('シフトの更新に失敗しました'); }
    },

    // ===== 訪問 =====
    getVisits(staffId, dateStr, period) {
      return this.visits
        .filter(v=>v.staffId===staffId&&v.date===dateStr&&v.period===period)
        .sort((a,b)=>{
          if (a.startTime&&b.startTime) return a.startTime.localeCompare(b.startTime);
          if (a.startTime) return -1; if (b.startTime) return 1;
          return (a.order||0)-(b.order||0);
        });
    },

    getVisitsForDay(staffId, dateStr) {
      return this.visits
        .filter(v=>v.staffId===staffId&&v.date===dateStr)
        .sort((a,b)=>{
          if (a.startTime&&b.startTime) return a.startTime.localeCompare(b.startTime);
          if (a.startTime) return -1; if (b.startTime) return 1;
          return 0;
        });
    },

    getVisitsWithTime(staffId, dateStr) {
      return this.getVisitsForDay(staffId, dateStr).filter(v=>v.startTime);
    },

    getVisitsNoTime(staffId, dateStr) {
      return this.getVisitsForDay(staffId, dateStr).filter(v=>!v.startTime);
    },

    // 重複訪問を横に並べてレイアウト計算
    tlLaneLayout(staffId) {
      const visits = this.getVisitsWithTime(staffId, this.timelineDate);
      if (!visits.length) return [];
      const toMin = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
      const colEnds = [];
      const placed = visits.map(v => {
        const startMin = toMin(v.startTime);
        const endMin   = v.endTime ? toMin(v.endTime) : startMin+30;
        let col = colEnds.findIndex(e => startMin >= e);
        if (col === -1) col = colEnds.length;
        colEnds[col] = endMin;
        return { visit: v, col };
      });
      const totalCols = colEnds.length;
      return placed.map(({ visit, col }) => ({
        visit,
        style: {
          ...this.tlBlockStyle(visit),
          left:  `calc(${(col/totalCols)*100}% + 3px)`,
          right: `calc(${((totalCols-col-1)/totalCols)*100}% + 3px)`,
        },
      }));
    },

    getClientName(clientId) { return this.clientList.find(c=>c.id===clientId)?.name||'（利用者不明）'; },
    getClient(clientId) { return this.clientList.find(c=>c.id===clientId)||null; },
    getAreaColor(clientId) { return this.getClient(clientId)?.areaColor||''; },

    // 住所から市区町村を抽出
    extractArea(address) {
      if (!address) return '';
      // 都道府県を除去
      let addr = address.trim().replace(/^.+?[都道府県]/, '');
      // 数字より前の部分（番地等を除く）
      const beforeDigit = addr.split(/[\d０-９]/)[0];
      // 最後の 市/区/町/村 まで
      const m = beforeDigit.match(/^(.*[市区町村])/);
      return m ? m[1] : (beforeDigit.slice(0,6) || address.slice(0,6));
    },

    // エリア→カラーのマップをlocalStorageで管理
    getAreaColorMap() {
      try { return JSON.parse(localStorage.getItem('area_color_map')||'{}'); } catch { return {}; }
    },
    saveAreaColorMap(map) { localStorage.setItem('area_color_map', JSON.stringify(map)); },

    // 住所からエリアカラーを自動取得・割り当て
    autoAssignAreaColor(address) {
      const area = this.extractArea(address);
      if (!area) return '';
      const map = this.getAreaColorMap();
      if (map[area]) return map[area];
      // 未使用の色を順番に割り当て
      const used = new Set(Object.values(map));
      const next = COLOR_OPTIONS.find(c=>!used.has(c)) || COLOR_OPTIONS[Object.keys(map).length % COLOR_OPTIONS.length];
      map[area] = next;
      this.saveAreaColorMap(map);
      return next;
    },

    // 住所入力時に自動でエリアカラーを設定
    onClientAddressChange() {
      if (!this.clientModal.areaColor && this.clientModal.address) {
        this.clientModal.areaColor = this.autoAssignAreaColor(this.clientModal.address);
      }
    },

    hexToRgba(hex, alpha) {
      if (!hex||hex.length<7) return 'white';
      const r=parseInt(hex.slice(1,3),16);
      const g=parseInt(hex.slice(3,5),16);
      const b=parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${alpha})`;
    },

    hasCrossConflict(clientId, dateStr) {
      const client=this.clientList.find(c=>c.id===clientId);
      if (!client) return false;
      return !!this.crossConflicts[`${client.name.replace(/[\s　]/g,'')}_${dateStr}`];
    },

    // 訪問カード表示用タスク（訪問固有 > 利用者デフォルト）
    getVisitDisplayTasks(visit) {
      const ids = visit.specialTasks?.length>0
        ? visit.specialTasks
        : (this.getClient(visit.clientId)?.specialTasks||[]);
      return ids.map(id=>SPECIAL_TASKS.find(t=>t.id===id)).filter(Boolean);
    },

    openAddVisit(staffId, dateStr, period) {
      const staff=this.staffList.find(s=>s.id===staffId);
      this.visitModal={
        show:true, isEdit:false, visitId:null,
        staffId, staffName:staff?.name||'',
        dateStr, dateLabel:this.formatDateJp(dateStr),
        period, clientId:'', clientNotes:'',
        location:'', startTime:'', endTime:'', notes:'', specialTasks:[], isEmergency:false,
      };
    },

    openEditVisit(visit) {
      const staff  =this.staffList.find(s=>s.id===visit.staffId);
      const client =this.getClient(visit.clientId);
      const tasks  =visit.specialTasks?.length>0 ? visit.specialTasks : (client?.specialTasks||[]);
      this.visitModal={
        show:true, isEdit:true, visitId:visit.id,
        staffId:visit.staffId, staffName:staff?.name||'',
        dateStr:visit.date, dateLabel:this.formatDateJp(visit.date),
        period:visit.period, clientId:visit.clientId,
        clientNotes:client?.notes||'',
        location:visit.location||'', startTime:visit.startTime||'',
        endTime:visit.endTime||'', notes:visit.notes||'',
        specialTasks:[...tasks], isEmergency:visit.isEmergency||false,
      };
    },

    onVisitClientChange() {
      const client=this.getClient(this.visitModal.clientId);
      this.visitModal.clientNotes=client?.notes||'';
      if (!this.visitModal.location&&client?.address) this.visitModal.location=client.address;
      if (!this.visitModal.isEdit&&client?.specialTasks?.length>0) {
        this.visitModal.specialTasks=[...client.specialTasks];
      }
    },

    toggleVisitTask(taskId) {
      const idx=this.visitModal.specialTasks.indexOf(taskId);
      if (idx===-1) this.visitModal.specialTasks.push(taskId);
      else this.visitModal.specialTasks.splice(idx,1);
    },

    async saveVisit() {
      if (!this.visitModal.clientId) { alert('利用者を選択してください。'); return; }
      const payload={
        staff_id:   this.visitModal.staffId,
        client_id:  this.visitModal.clientId,
        date:       this.visitModal.dateStr,
        period:     this.visitModal.period,
        location:   this.visitModal.location,
        start_time: this.visitModal.startTime,
        end_time:   this.visitModal.endTime,
        notes:      this.visitModal.notes,
        special_tasks: this.visitModal.specialTasks,
        is_emergency: this.visitModal.isEmergency||false,
      };
      try {
        if (this.visitModal.isEdit) {
          const {error}=await db.from('visits').update(payload).eq('id',this.visitModal.visitId);
          if (error) throw error;
          const idx=this.visits.findIndex(v=>v.id===this.visitModal.visitId);
          if (idx!==-1) this.visits.splice(idx,1,{
            ...this.visits[idx],
            staffId:payload.staff_id, clientId:payload.client_id,
            period:payload.period, location:payload.location,
            startTime:payload.start_time, endTime:payload.end_time,
            notes:payload.notes, specialTasks:payload.special_tasks,
            isEmergency:payload.is_emergency||false,
          });
        } else {
          const order=this.getVisits(payload.staff_id,payload.date,payload.period).length;
          const {data,error}=await db.from('visits').insert({...payload,order}).select().single();
          if (error) throw error;
          this.visits.push({
            id:data.id, staffId:data.staff_id, clientId:data.client_id,
            date:data.date, period:data.period,
            location:data.location||'', startTime:data.start_time||'',
            endTime:data.end_time||'', notes:data.notes||'',
            order:data.order||0, specialTasks:data.special_tasks||[],
            isEmergency:data.is_emergency||false,
          });
        }
      } catch(e) { console.error(e); alert('訪問の保存に失敗しました'); return; }
      this.closeVisitModal();
    },

    async deleteVisit() {
      if (!confirm('この訪問を削除しますか？')) return;
      try {
        const {error}=await db.from('visits').delete().eq('id',this.visitModal.visitId);
        if (error) throw error;
        this.visits=this.visits.filter(v=>v.id!==this.visitModal.visitId);
      } catch(e) { alert('削除に失敗しました'); return; }
      this.closeVisitModal();
    },
    closeVisitModal() { this.visitModal.show=false; },

    // ===== スタッフ =====
    openAddStaff() {
      this.staffModal={show:true,isEdit:false,staffId:null,name:'',color:COLOR_OPTIONS[this.staffList.length%COLOR_OPTIONS.length],active:true};
    },
    openEditStaff(staff) {
      this.staffModal={show:true,isEdit:true,staffId:staff.id,name:staff.name,color:staff.color,active:staff.active};
    },
    async saveStaff() {
      if (!this.staffModal.name.trim()) { alert('スタッフ名を入力してください。'); return; }
      const payload={name:this.staffModal.name.trim(),color:this.staffModal.color,active:this.staffModal.active};
      try {
        if (this.staffModal.isEdit) {
          const {error}=await db.from('staff').update(payload).eq('id',this.staffModal.staffId);
          if (error) throw error;
          const idx=this.staffList.findIndex(s=>s.id===this.staffModal.staffId);
          if (idx!==-1) this.staffList.splice(idx,1,{id:this.staffModal.staffId,...payload});
        } else {
          const {data,error}=await db.from('staff').insert(payload).select().single();
          if (error) throw error;
          this.staffList.push({id:data.id,...payload});
        }
      } catch(e) { alert('スタッフの保存に失敗しました'); return; }
      this.closeStaffModal();
    },
    async deleteStaff(staff) {
      if (!confirm(`「${staff.name}」を削除しますか？\n関連する訪問データも削除されます。`)) return;
      try {
        const {error}=await db.from('staff').delete().eq('id',staff.id);
        if (error) throw error;
        this.staffList=this.staffList.filter(s=>s.id!==staff.id);
        this.visits=this.visits.filter(v=>v.staffId!==staff.id);
      } catch(e) { alert('削除に失敗しました'); }
    },
    closeStaffModal() { this.staffModal.show=false; },

    // ===== 利用者 =====
    openAddClient() {
      this.clientModal={show:true,isEdit:false,clientId:null,name:'',address:'',notes:'',weeklyVisits:null,freqType:'week',onHold:false,specialTasks:[],areaColor:''};
    },
    openEditClient(client) {
      this.clientModal={show:true,isEdit:true,clientId:client.id,name:client.name,address:client.address||'',notes:client.notes||'',weeklyVisits:client.weeklyVisits||null,freqType:client.freqType||'week',onHold:client.onHold||false,specialTasks:[...(client.specialTasks||[])],areaColor:client.areaColor||''};
    },
    toggleClientTask(taskId) {
      const idx=this.clientModal.specialTasks.indexOf(taskId);
      if (idx===-1) this.clientModal.specialTasks.push(taskId);
      else this.clientModal.specialTasks.splice(idx,1);
    },
    async saveClient() {
      if (!this.clientModal.name.trim()) { alert('利用者名を入力してください。'); return; }
      const wv=this.clientModal.weeklyVisits?parseInt(this.clientModal.weeklyVisits):null;
      const payload={
        name:this.clientModal.name.trim(), address:this.clientModal.address.trim(),
        notes:this.clientModal.notes.trim(), weekly_visits:wv,
        freq_type:this.clientModal.freqType||'week', on_hold:this.clientModal.onHold||false,
        special_tasks:this.clientModal.specialTasks||[],
        area_color:this.clientModal.areaColor||'',
      };
      try {
        if (this.clientModal.isEdit) {
          const {error}=await db.from('clients').update(payload).eq('id',this.clientModal.clientId);
          if (error) throw error;
          const idx=this.clientList.findIndex(c=>c.id===this.clientModal.clientId);
          if (idx!==-1) this.clientList.splice(idx,1,{
            id:this.clientModal.clientId,...this.clientList[idx],
            name:payload.name, address:payload.address, notes:payload.notes,
            weeklyVisits:wv, freqType:payload.freq_type, onHold:payload.on_hold,
            specialTasks:payload.special_tasks, areaColor:payload.area_color,
          });
        } else {
          const {data,error}=await db.from('clients').insert(payload).select().single();
          if (error) throw error;
          this.clientList.push({id:data.id,name:data.name,address:data.address||'',notes:data.notes||'',weeklyVisits:data.weekly_visits,freqType:data.freq_type||'week',onHold:data.on_hold||false,specialTasks:data.special_tasks||[],areaColor:data.area_color||''});
        }
      } catch(e) { alert('利用者の保存に失敗しました'); return; }
      this.sortClients();
      this.closeClientModal();
    },
    sortClients() { this.clientList.sort((a,b)=>a.name.localeCompare(b.name,'ja')); },
    async deleteClient(client) {
      if (!confirm(`「${client.name}」を削除しますか？\n関連する訪問データも削除されます。`)) return;
      try {
        const {error}=await db.from('clients').delete().eq('id',client.id);
        if (error) throw error;
        this.clientList=this.clientList.filter(c=>c.id!==client.id);
        this.visits=this.visits.filter(v=>v.clientId!==client.id);
      } catch(e) { alert('削除に失敗しました'); }
    },
    closeClientModal() { this.clientModal.show=false; },

    // ===== タイムライン =====
    tlPrevDay() {
      const d=new Date(this.timelineDate+'T00:00:00'); d.setDate(d.getDate()-1);
      this.timelineDate=this.formatDateStr(d);
    },
    tlNextDay() {
      const d=new Date(this.timelineDate+'T00:00:00'); d.setDate(d.getDate()+1);
      this.timelineDate=this.formatDateStr(d);
    },
    tlToday() { this.timelineDate=this.formatDateStr(new Date()); },

    tlTimeToY(timeStr) {
      if (!timeStr) return null;
      const [h,m]=timeStr.split(':').map(Number);
      return Math.max(0,((h-TL_START_H)*60+m)*TL_PX_PER_MIN);
    },

    tlBlockStyle(visit) {
      const startY=this.tlTimeToY(visit.startTime);
      if (startY===null) return {top:'0px',height:'30px',opacity:'0.6'};
      const endY=this.tlTimeToY(visit.endTime);
      const h=endY!==null?Math.max(24,endY-startY):36;
      return {top:startY+'px',height:h+'px'};
    },

    tlGetGaps(staffId) {
      const sorted=this.getVisitsForDay(staffId,this.timelineDate)
        .filter(v=>v.startTime&&v.endTime);
      const gaps=[];
      const toMin=t=>{const[h,m]=t.split(':').map(Number);return(h-TL_START_H)*60+m;};
      let prev=0;
      for (const v of sorted) {
        const startMin=toMin(v.startTime);
        const endMin  =toMin(v.endTime);
        const gapDur  =startMin-prev;
        if (gapDur>=30) gaps.push({topPx:prev*TL_PX_PER_MIN,height:gapDur*TL_PX_PER_MIN,label:this.tlFormatDur(gapDur)});
        prev=Math.max(prev,endMin);
      }
      const lastGap=(TL_END_H-TL_START_H)*60-prev;
      if (lastGap>=30) gaps.push({topPx:prev*TL_PX_PER_MIN,height:lastGap*TL_PX_PER_MIN,label:this.tlFormatDur(lastGap)});
      return gaps;
    },
    tlFormatDur(min) {
      return min>=60 ? `空き ${Math.floor(min/60)}h${min%60>0?min%60+'m':''}` : `空き ${min}m`;
    },

    // ===== 一括入力 =====
    openBulkModal() {
      const today=new Date();
      this.bulkModal={
        show:true, clientId:'',
        year:today.getFullYear(), month:today.getMonth(),
        selectedDates:[],
        staffMode:'single', staffId:this.currentStaff?.id||'',
        perDayStaff:{}, startTime:'', endTime:'', saving:false,
      };
    },
    closeBulkModal() { this.bulkModal.show=false; },
    prevBulkMonth() {
      if (this.bulkModal.month===0){this.bulkModal.year--;this.bulkModal.month=11;}
      else this.bulkModal.month--;
      this.bulkModal.selectedDates=[];
    },
    nextBulkMonth() {
      if (this.bulkModal.month===11){this.bulkModal.year++;this.bulkModal.month=0;}
      else this.bulkModal.month++;
      this.bulkModal.selectedDates=[];
    },
    toggleBulkDate(dateStr) {
      const idx=this.bulkModal.selectedDates.indexOf(dateStr);
      if (idx===-1) {
        this.bulkModal.selectedDates.push(dateStr);
        if (!this.bulkModal.perDayStaff[dateStr]) this.bulkModal.perDayStaff[dateStr]=this.bulkModal.staffId||'';
      } else {
        this.bulkModal.selectedDates.splice(idx,1);
      }
    },

    async saveBulk() {
      if (!this.bulkModal.clientId) { alert('利用者を選択してください。'); return; }
      if (!this.bulkModal.selectedDates.length) { alert('日付を選択してください。'); return; }
      if (this.bulkModal.staffMode==='single'&&!this.bulkModal.staffId) { alert('スタッフを選択してください。'); return; }
      if (this.bulkModal.staffMode==='perday') {
        const missing=this.bulkModal.selectedDates.filter(d=>!this.bulkModal.perDayStaff[d]);
        if (missing.length) { alert(`${missing.length}日分のスタッフが未設定です。`); return; }
      }
      const derivePeriod=t=>t&&parseInt(t.split(':')[0])>=12?'afternoon':'morning';
      const clientTasks=this.getClient(this.bulkModal.clientId)?.specialTasks||[];
      const records=[];
      const bulkStart=this.bulkModal.startTime||'';
      const bulkEnd  =this.bulkModal.endTime||'';
      for (const dateStr of this.bulkModal.selectedDates) {
        const staffId=this.bulkModal.staffMode==='single'?this.bulkModal.staffId:this.bulkModal.perDayStaff[dateStr];
        const period=derivePeriod(bulkStart);
        records.push({
          staff_id:staffId, client_id:this.bulkModal.clientId,
          date:dateStr, period,
          start_time:bulkStart, end_time:bulkEnd,
          order:this.getVisits(staffId,dateStr,period).length,
          special_tasks:clientTasks,
        });
      }
      this.bulkModal.saving=true;
      try {
        const {data,error}=await db.from('visits').insert(records).select();
        if (error) throw error;
        (data||[]).forEach(v=>{
          this.visits.push({
            id:v.id, staffId:v.staff_id, clientId:v.client_id,
            date:v.date, period:v.period, location:'',
            startTime:v.start_time||'', endTime:v.end_time||'',
            notes:'', order:v.order||0,
            specialTasks:v.special_tasks||[],
          });
        });
        this.closeBulkModal();
      } catch(e) { console.error(e); alert('登録に失敗しました'); }
      finally { this.bulkModal.saving=false; }
    },

    async deleteBulk() {
      if (!this.bulkModal.clientId) { alert('利用者を選択してください。'); return; }
      if (!this.bulkModal.selectedDates.length) { alert('日付を選択してください。'); return; }
      const toDelete=this.visits.filter(v=>
        v.clientId===this.bulkModal.clientId&&
        this.bulkModal.selectedDates.includes(v.date)
      );
      if (!toDelete.length) { alert('該当する訪問が見つかりません。'); return; }
      if (!confirm(`${toDelete.length}件の訪問を削除しますか？`)) return;
      try {
        const ids=toDelete.map(v=>v.id);
        const {error}=await db.from('visits').delete().in('id',ids);
        if (error) throw error;
        this.visits=this.visits.filter(v=>!ids.includes(v.id));
        this.closeBulkModal();
      } catch(e) { alert('削除に失敗しました'); }
    },

    // ===== 週ナビ / 印刷 =====
    prevWeek()  { this.weekOffset--; this.loadCrossTeamData(); },
    nextWeek()  { this.weekOffset++; this.loadCrossTeamData(); },
    goToday()   { this.weekOffset=0; this.loadCrossTeamData(); },
    async loadCrossTeamData() {
      try {
        const [{data:otherVisits},{data:otherClients}]=await Promise.all([
          db2.from('visits').select('client_id, date'),
          db2.from('clients').select('id, name'),
        ]);
        const nameMap={};
        (otherClients||[]).forEach(c=>{nameMap[c.id]=c.name.replace(/[\s　]/g,'');});
        const conflicts={};
        (otherVisits||[]).forEach(v=>{const name=nameMap[v.client_id];if(name)conflicts[`${name}_${v.date}`]=true;});
        this.crossConflicts=conflicts;
      } catch(e) { console.warn('他チームデータ取得エラー:',e); }
    },
    printSchedule() { this.printModal.show = false; window.print(); },
  },

  unmounted() {
    clearInterval(this._nowTimer);
  },

  async mounted() {
    this._nowTimer = setInterval(() => { this.now = new Date(); }, 60000);
    this.timelineDate=this.formatDateStr(new Date());
    const {data:pwdData}=await db.from('settings').select('value').eq('key','app_password').single();
    this.appPassword=pwdData?.value||'';
    const storedAuth=localStorage.getItem('app_auth');
    if (storedAuth&&storedAuth===this.appPassword) {
      this.appAuthenticated=true;
      const savedStaff=localStorage.getItem('incident_staff');
      if (savedStaff) { try { this.currentStaff=JSON.parse(savedStaff); } catch {} }
      await this.loadAllData();
      if (this.currentStaff) {
        const fresh=this.staffList.find(s=>s.id===this.currentStaff.id);
        if (fresh) this.currentStaff=fresh;
      }
    } else { this.loading=false; }
  },
}).mount('#app');

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { createApp } = Vue;

createApp({
  data() {
    return {
      loading: true,
      view: 'password', // password | login | subjects | quiz | result | admin
      pwInput: '',
      pwError: false,

      // ユーザー
      users: [],
      currentUser: null,

      // 科目・問題
      subjects: [],
      allQuestions: [],

      // 自分の演習履歴
      myResults: [],

      // クイズ状態
      currentSubject: null,
      quizQuestions: [],
      currentIndex: 0,
      selectedIndex: null,
      answered: false,
      results: [],

      // 管理
      adminTab: 'subjects',
      filterSubjectId: '',
      newSubject: { icon: '📚', name: '', description: '' },
      newQuestion: {
        subject_id: '',
        question_text: '',
        choices: ['', '', '', ''],
        correct_index: 0,
        explanation: '',
      },
      newUserName: '',
    };
  },

  computed: {
    progressPercent() {
      if (!this.quizQuestions.length) return 0;
      return Math.round((this.currentIndex / this.quizQuestions.length) * 100);
    },
    currentQuestion() {
      return this.quizQuestions[this.currentIndex] || null;
    },
    isLastQuestion() {
      return this.currentIndex === this.quizQuestions.length - 1;
    },
    correctCount() {
      return this.results.filter(r => r.correct).length;
    },
    wrongAnswers() {
      return this.results.filter(r => !r.correct).map(r => r.question);
    },
    scorePercent() {
      if (!this.quizQuestions.length) return 0;
      return Math.round((this.correctCount / this.quizQuestions.length) * 100);
    },
    canAddQuestion() {
      const q = this.newQuestion;
      return q.subject_id && q.question_text.trim() && q.choices.every(c => c.trim());
    },
    filteredQuestions() {
      if (!this.filterSubjectId) return this.allQuestions;
      return this.allQuestions.filter(q => q.subject_id === this.filterSubjectId);
    },
  },

  methods: {
    async loadData() {
      const [subjectRes, questionRes, userRes] = await Promise.all([
        db.from('quiz_subjects').select('*').order('created_at'),
        db.from('quiz_questions').select('*').order('created_at'),
        db.from('quiz_users').select('*').order('name'),
      ]);

      this.allQuestions = questionRes.data || [];
      this.users = userRes.data || [];
      this.subjects = (subjectRes.data || []).map(s => ({
        ...s,
        question_count: (questionRes.data || []).filter(q => q.subject_id === s.id).length,
      }));
    },

    async loadMyResults() {
      if (!this.currentUser) return;
      const { data } = await db
        .from('quiz_results')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .order('played_at', { ascending: false });
      this.myResults = data || [];
    },

    subjectBestScore(subjectId) {
      const scores = this.myResults.filter(r => r.subject_id === subjectId);
      if (!scores.length) return null;
      return Math.max(...scores.map(r => Math.round(r.correct_count / r.total_questions * 100)));
    },

    subjectPlayCount(subjectId) {
      return this.myResults.filter(r => r.subject_id === subjectId).length;
    },

    // ===== パスワード =====
    checkPassword() {
      if (this.pwInput === APP_PASSWORD) {
        localStorage.setItem('quiz_auth', '1');
        this.pwInput = '';
        this.pwError = false;
        this.view = 'login';
      } else {
        this.pwError = true;
        this.pwInput = '';
      }
    },

    // ===== ログイン =====
    async selectUser(user) {
      this.currentUser = user;
      localStorage.setItem('quiz_user_id', user.id);
      await this.loadMyResults();
      this.view = 'subjects';
    },

    switchUser() {
      if (!confirm(`「${this.currentUser.name}」からログアウトしますか？`)) return;
      this.currentUser = null;
      localStorage.removeItem('quiz_user_id');
      this.myResults = [];
      this.view = 'login';
    },

    // ===== クイズ =====
    startQuiz(subject) {
      const questions = this.allQuestions.filter(q => q.subject_id === subject.id);
      if (!questions.length) {
        alert('この科目にはまだ問題がありません。\n管理画面から問題を追加してください。');
        return;
      }
      this.currentSubject = subject;
      this.quizQuestions = this.shuffle([...questions]);
      this.currentIndex = 0;
      this.selectedIndex = null;
      this.answered = false;
      this.results = [];
      this.view = 'quiz';
    },

    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },

    selectAnswer(i) {
      if (this.answered) return;
      this.selectedIndex = i;
      this.answered = true;
      this.results.push({ correct: i === this.currentQuestion.correct_index, question: this.currentQuestion });
    },

    choiceClass(i) {
      if (!this.answered) return '';
      if (i === this.currentQuestion.correct_index) return 'show-correct';
      if (i === this.selectedIndex) return 'selected-incorrect';
      return '';
    },

    async nextQuestion() {
      if (this.isLastQuestion) {
        await this.saveResult();
        this.view = 'result';
        return;
      }
      this.currentIndex++;
      this.selectedIndex = null;
      this.answered = false;
    },

    async saveResult() {
      if (!this.currentUser) return;
      const { error } = await db.from('quiz_results').insert({
        user_id: this.currentUser.id,
        subject_id: this.currentSubject.id,
        total_questions: this.quizQuestions.length,
        correct_count: this.correctCount,
      });
      if (!error) await this.loadMyResults();
    },

    exitQuiz() {
      if (confirm('演習を終了して科目一覧に戻りますか？')) {
        this.view = 'subjects';
      }
    },

    retryQuiz() {
      this.startQuiz(this.currentSubject);
    },

    // ===== 科目管理 =====
    async addSubject() {
      if (!this.newSubject.name.trim()) return;
      const { error } = await db.from('quiz_subjects').insert({
        name: this.newSubject.name.trim(),
        description: this.newSubject.description.trim(),
        icon: this.newSubject.icon || '📚',
      });
      if (error) { alert('追加に失敗しました: ' + error.message); return; }
      this.newSubject = { icon: '📚', name: '', description: '' };
      await this.loadData();
    },

    async deleteSubject(subject) {
      if (!confirm(`「${subject.name}」を削除しますか？\n※この科目の問題もすべて削除されます。`)) return;
      const { error } = await db.from('quiz_subjects').delete().eq('id', subject.id);
      if (error) { alert('削除に失敗しました: ' + error.message); return; }
      await this.loadData();
    },

    // ===== 問題管理 =====
    async addQuestion() {
      if (!this.canAddQuestion) return;
      const q = this.newQuestion;
      const { error } = await db.from('quiz_questions').insert({
        subject_id: q.subject_id,
        question_text: q.question_text.trim(),
        choices: q.choices.map(c => c.trim()),
        correct_index: q.correct_index,
        explanation: q.explanation.trim(),
      });
      if (error) { alert('追加に失敗しました: ' + error.message); return; }
      this.newQuestion = {
        subject_id: q.subject_id,
        question_text: '', choices: ['', '', '', ''], correct_index: 0, explanation: '',
      };
      await this.loadData();
    },

    async deleteQuestion(question) {
      if (!confirm('この問題を削除しますか？')) return;
      const { error } = await db.from('quiz_questions').delete().eq('id', question.id);
      if (error) { alert('削除に失敗しました: ' + error.message); return; }
      await this.loadData();
    },

    // ===== メンバー管理 =====
    async addUser() {
      if (!this.newUserName.trim()) return;
      const { error } = await db.from('quiz_users').insert({ name: this.newUserName.trim() });
      if (error) { alert('追加に失敗しました: ' + error.message); return; }
      this.newUserName = '';
      await this.loadData();
    },

    async deleteUser(user) {
      if (!confirm(`「${user.name}」を削除しますか？\n※この人の演習記録もすべて削除されます。`)) return;
      const { error } = await db.from('quiz_users').delete().eq('id', user.id);
      if (error) { alert('削除に失敗しました: ' + error.message); return; }
      if (this.currentUser?.id === user.id) {
        this.currentUser = null;
        localStorage.removeItem('quiz_user_id');
        this.myResults = [];
      }
      await this.loadData();
    },

    subjectName(subjectId) {
      return this.subjects.find(s => s.id === subjectId)?.name || '';
    },
  },

  async mounted() {
    await this.loadData();

    // セッション内で認証済みかチェック
    if (localStorage.getItem('quiz_auth') === '1') {
      const savedId = localStorage.getItem('quiz_user_id');
      if (savedId) {
        const found = this.users.find(u => u.id === savedId);
        if (found) {
          this.currentUser = found;
          await this.loadMyResults();
          this.view = 'subjects';
        } else {
          this.view = 'login';
        }
      } else {
        this.view = 'login';
      }
    }
    // localStorage に認証情報がなければ password 画面のまま

    this.loading = false;
  },
}).mount('#app');

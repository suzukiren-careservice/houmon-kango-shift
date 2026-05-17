const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { createApp } = Vue;

createApp({
  data() {
    return {
      loading: true,
      view: 'subjects', // subjects | quiz | result | admin

      // 科目
      subjects: [],

      // 全問題
      allQuestions: [],

      // クイズ状態
      currentSubject: null,
      quizQuestions: [],
      currentIndex: 0,
      selectedIndex: null,
      answered: false,
      results: [], // { correct: bool, question: obj }

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
      return (
        q.subject_id &&
        q.question_text.trim() &&
        q.choices.every(c => c.trim())
      );
    },
    filteredQuestions() {
      if (!this.filterSubjectId) return this.allQuestions;
      return this.allQuestions.filter(q => q.subject_id === this.filterSubjectId);
    },
  },

  methods: {
    async loadData() {
      // 科目を取得
      const { data: subjectRows } = await db
        .from('quiz_subjects')
        .select('*')
        .order('created_at');

      // 問題を取得
      const { data: questionRows } = await db
        .from('quiz_questions')
        .select('*')
        .order('created_at');

      this.allQuestions = questionRows || [];

      // 各科目に問題数を付与
      this.subjects = (subjectRows || []).map(s => ({
        ...s,
        question_count: (questionRows || []).filter(q => q.subject_id === s.id).length,
      }));
    },

    // ===== クイズ =====
    startQuiz(subject) {
      const questions = this.allQuestions.filter(q => q.subject_id === subject.id);
      if (questions.length === 0) {
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
      const correct = i === this.currentQuestion.correct_index;
      this.results.push({ correct, question: this.currentQuestion });
    },

    choiceClass(i) {
      if (!this.answered) return '';
      const correctIdx = this.currentQuestion.correct_index;
      if (i === correctIdx) return 'show-correct';
      if (i === this.selectedIndex) return 'selected-incorrect';
      return '';
    },

    nextQuestion() {
      if (this.isLastQuestion) {
        this.view = 'result';
        return;
      }
      this.currentIndex++;
      this.selectedIndex = null;
      this.answered = false;
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
      const { name, description, icon } = this.newSubject;
      if (!name.trim()) return;

      const { error } = await db.from('quiz_subjects').insert({
        name: name.trim(),
        description: description.trim(),
        icon: icon || '📚',
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
        subject_id: q.subject_id, // 同じ科目のまま継続入力しやすいよう保持
        question_text: '',
        choices: ['', '', '', ''],
        correct_index: 0,
        explanation: '',
      };
      await this.loadData();
    },

    async deleteQuestion(question) {
      if (!confirm('この問題を削除しますか？')) return;

      const { error } = await db.from('quiz_questions').delete().eq('id', question.id);
      if (error) { alert('削除に失敗しました: ' + error.message); return; }

      await this.loadData();
    },

    subjectName(subjectId) {
      const s = this.subjects.find(s => s.id === subjectId);
      return s ? s.name : '';
    },
  },

  async mounted() {
    await this.loadData();
    this.loading = false;
  },
}).mount('#app');

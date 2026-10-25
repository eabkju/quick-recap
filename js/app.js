import { Storage } from './storage.js';
import { generateMcqExam } from './mcq.js';
import { attachSwipeListener } from './swipe.js';

class QuickRecapApp {
  constructor() {
    this.chapters = [];
    this.currentChapter = null;
    this.currentQuestions = [];
    this.currentIndex = 0;
    this.view = 'home'; // 'home' | 'study' | 'exam' | 'review' | 'hard' | 'flagged'
    
    // Exam state
    this.activeExam = null;
    this.examCurrentIndex = 0;
    this.examUserAnswers = [];
    this.examTimerInterval = null;
    this.examStartTime = null;

    // Search state
    this.homeSearchQuery = '';
    this.homeSearchFilter = 'all';
    this.allQuestionsCache = null;

    // Dom elements
    this.appRoot = document.getElementById('app-root');
    this.thinProgressBar = document.getElementById('thin-progress-bar');
    this.headerTitle = document.getElementById('header-title');
    this.backBtn = document.getElementById('header-back-btn');
    this.themeToggleBtn = document.getElementById('theme-toggle-btn');

    this.swipeCleanup = null;
  }

  async init() {
    this.setupTheme();
    this.bindGlobalEvents();
    await this.loadManifest();
    this.renderHome();
  }

  // Theme Management
  setupTheme() {
    const saved = Storage.getTheme();
    if (saved === 'dark' || (saved === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    Storage.setTheme(next);
  }

  // Load Database Manifest and Chapters
  async loadManifest() {
    try {
      const res = await fetch('./database/manifest.json');
      if (res.ok) {
        this.chapters = await res.json();
      } else {
        // Fallback default chapters if manifest fetch fails
        this.chapters = [
          { id: 'cardiology_rapid_recall_all_99_explained', filename: 'cardiology_rapid_recall_all_99_explained.json', title: 'Cardiology Quick Recap All 99 Explained', count: 99 },
          { id: 'endocrinology', filename: 'endocrinology.json', title: 'Endocrinology', count: 52 },
          { id: 'gastroenterology', filename: 'gastroenterology.json', title: 'Gastroenterology', count: 46 },
          { id: 'haematology', filename: 'haematology.json', title: 'Haematology', count: 32 },
          { id: 'nephrology', filename: 'nephrology.json', title: 'Nephrology', count: 31 },
          { id: 'neurology_rapid_recall_all_46_explained', filename: 'neurology_rapid_recall_all_46_explained.json', title: 'Neurology Quick Recap All 46 Explained', count: 46 },
          { id: 'respiratory_rapid_recall_all_70_explained', filename: 'respiratory_rapid_recall_all_70_explained.json', title: 'Respiratory Quick Recap All 70 Explained', count: 70 },
          { id: 'rheumatology', filename: 'rheumatology.json', title: 'Rheumatology', count: 104 }
        ];
      }
    } catch (e) {
      console.warn('Manifest load error, using fallbacks:', e);
    }
  }

  async fetchChapterQuestions(chapter) {
    try {
      const res = await fetch(`./database/${chapter.filename}`);
      const data = await res.json();
      return data.map((item, idx) => ({
        ...item,
        id: `${chapter.id}_${idx}`,
        originalIndex: idx,
        chapterId: chapter.id,
        chapterTitle: chapter.title
      }));
    } catch (e) {
      console.error(`Error loading chapter ${chapter.filename}:`, e);
      return [];
    }
  }

  async fetchAllQuestions() {
    if (this.allQuestionsCache && this.allQuestionsCache.length > 0) {
      return this.allQuestionsCache;
    }
    let all = [];
    for (const ch of this.chapters) {
      const qs = await this.fetchChapterQuestions(ch);
      all = all.concat(qs);
    }
    this.allQuestionsCache = all;
    return all;
  }

  getQuestionKey(q) {
    return `${q.chapterId || 'gen'}::${q.question}`;
  }

  setProgressBar(percent) {
    if (this.thinProgressBar) {
      this.thinProgressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }
  }

  bindGlobalEvents() {
    if (this.themeToggleBtn) {
      this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }
    if (this.backBtn) {
      this.backBtn.addEventListener('click', () => {
        if (this.view === 'exam') {
          if (confirm('Are you sure you want to quit this exam? Your progress will be lost.')) {
            clearInterval(this.examTimerInterval);
            this.renderHome();
          }
        } else {
          this.renderHome();
        }
      });
    }

    // Keyboard navigation for study mode
    window.addEventListener('keydown', (e) => {
      if (this.view === 'study') {
        if (e.key === 'ArrowRight' || e.key === 'Space') {
          e.preventDefault();
          this.nextQuestion();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.prevQuestion();
        }
      }
    });
  }

  // --- VIEW: HOME ---
  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]));
  }

  highlightMatch(text, query) {
    if (!text) return '';
    if (!query) return this.escapeHtml(text);
    const escapedText = this.escapeHtml(text);
    const words = query.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return escapedText;

    const safeWords = [...new Set(words)]
      .sort((a, b) => b.length - a.length)
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    try {
      const regex = new RegExp(`(${safeWords.join('|')})`, 'gi');
      return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
    } catch {
      return escapedText;
    }
  }

  renderHome() {
    this.view = 'home';
    this.setProgressBar(0);
    if (this.backBtn) this.backBtn.style.display = 'none';
    if (this.headerTitle) this.headerTitle.textContent = 'Medical Quick Recap';

    this.appRoot.innerHTML = `
      <div class="home-search-section">
        <div class="home-search-box">
          <span class="home-search-icon">🔍</span>
          <input 
            type="search" 
            id="home-search-input" 
            class="home-search-input" 
            placeholder="Search all questions, answers, topics, explanations..." 
            value="${this.escapeHtml(this.homeSearchQuery || '')}"
            autocomplete="off"
            spellcheck="false"
          />
          <button type="button" id="home-search-clear-btn" class="home-search-clear-btn" style="display: ${this.homeSearchQuery ? 'flex' : 'none'};" title="Clear Search">✕</button>
        </div>
      </div>
      <div id="home-main-content"></div>
    `;

    const searchInput = this.appRoot.querySelector('#home-search-input');
    const clearBtn = this.appRoot.querySelector('#home-search-clear-btn');

    searchInput?.addEventListener('input', (e) => {
      this.homeSearchQuery = e.target.value;
      if (clearBtn) clearBtn.style.display = this.homeSearchQuery ? 'flex' : 'none';
      this.updateHomeMainContent();
    });

    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.clearHomeSearch();
      }
    });

    clearBtn?.addEventListener('click', () => {
      this.clearHomeSearch();
    });

    this.updateHomeMainContent();
  }

  clearHomeSearch() {
    this.homeSearchQuery = '';
    this.homeSearchFilter = 'all';
    const input = this.appRoot.querySelector('#home-search-input');
    const clearBtn = this.appRoot.querySelector('#home-search-clear-btn');
    if (input) {
      input.value = '';
      input.focus();
    }
    if (clearBtn) {
      clearBtn.style.display = 'none';
    }
    this.updateHomeMainContent();
  }

  async updateHomeMainContent() {
    const mainContent = this.appRoot.querySelector('#home-main-content');
    if (!mainContent) return;

    const query = (this.homeSearchQuery || '').trim();
    if (!query) {
      this.renderHomeOverview(mainContent);
    } else {
      await this.renderHomeSearchResults(mainContent, query);
    }
  }

  renderHomeOverview(container) {
    const hardQuestions = Storage.getHardQuestions();
    const flaggedQuestions = Storage.getFlaggedQuestions();
    const allProgress = Storage.getAllProgress();

    let chaptersHtml = this.chapters.map(ch => {
      const prog = allProgress[ch.id] || { completed: [] };
      const completedCount = (prog.completed || []).length;
      const percent = ch.count ? Math.round((completedCount / ch.count) * 100) : 0;
      const lastIndex = prog.lastIndex || 0;

      return `
        <div class="chapter-card" data-chapter-id="${ch.id}">
          <div class="chapter-card-header">
            <div>
              <div class="chapter-title">${this.escapeHtml(ch.title)}</div>
              <div class="text-muted" style="font-size: 0.8rem; margin-top: 0.2rem;">
                ${ch.count} Questions • ${completedCount} Completed (${percent}%)
              </div>
            </div>
            <span class="chapter-badge">${percent}%</span>
          </div>

          <div style="height: 6px; background: var(--border-color); border-radius: 999px; overflow: hidden;">
            <div style="height: 100%; width: ${percent}%; background: linear-gradient(90deg, #3b82f6, #10b981); transition: width 0.3s;"></div>
          </div>

          <div class="chapter-actions">
            <button class="btn btn-primary btn-sm btn-study" data-chapter-id="${ch.id}" style="flex: 1;">
              📖 ${lastIndex > 0 ? `Resume (#${lastIndex + 1})` : 'Start Study'}
            </button>
            <button class="btn btn-secondary btn-sm btn-exam" data-chapter-id="${ch.id}">
              📝 Exam
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="quick-action-grid">
        <div class="action-card grand-exam" id="btn-grand-exam">
          <div class="action-icon" style="background: rgba(37,99,235,0.15); color: #2563eb;">🏆</div>
          <div>
            <div class="font-bold" style="font-size: 0.95rem;">Grand Exam</div>
            <div class="text-muted" style="font-size: 0.75rem;">All Topics Combined</div>
          </div>
        </div>

        <div class="action-card hard-questions" id="btn-hard-questions">
          <div class="action-icon" style="background: rgba(239,68,68,0.15); color: #ef4444;">🔥</div>
          <div>
            <div class="font-bold" style="font-size: 0.95rem;">Hard Questions</div>
            <div class="text-muted" style="font-size: 0.75rem;">${hardQuestions.length} Mistakes to Master</div>
          </div>
        </div>

        <div class="action-card flagged" id="btn-flagged-questions">
          <div class="action-icon" style="background: rgba(245,158,11,0.15); color: #f59e0b;">⭐</div>
          <div>
            <div class="font-bold" style="font-size: 0.95rem;">Flagged Questions</div>
            <div class="text-muted" style="font-size: 0.75rem;">${flaggedQuestions.length} Important Items</div>
          </div>
        </div>

        <div class="action-card" id="btn-search-questions">
          <div class="action-icon" style="background: rgba(16,185,129,0.15); color: #10b981;">🔍</div>
          <div>
            <div class="font-bold" style="font-size: 0.95rem;">Quick Search</div>
            <div class="text-muted" style="font-size: 0.75rem;">Find Any Q/A Fast</div>
          </div>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
        <h2 style="font-size: 1.1rem; font-weight: 800;">Chapters (${this.chapters.length})</h2>
        <span class="text-muted" style="font-size: 0.8rem;">Tap a chapter to study</span>
      </div>

      <div class="chapters-container">
        ${chaptersHtml}
      </div>
    `;

    // Bind Home events
    container.querySelectorAll('.btn-study').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chId = btn.getAttribute('data-chapter-id');
        this.startStudyMode(chId);
      });
    });

    container.querySelectorAll('.btn-exam').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chId = btn.getAttribute('data-chapter-id');
        this.startExamMode(chId);
      });
    });

    container.querySelector('#btn-grand-exam')?.addEventListener('click', () => {
      this.startGrandExam();
    });

    container.querySelector('#btn-hard-questions')?.addEventListener('click', () => {
      this.renderHardQuestions();
    });

    container.querySelector('#btn-flagged-questions')?.addEventListener('click', () => {
      this.renderFlaggedQuestions();
    });

    container.querySelector('#btn-search-questions')?.addEventListener('click', () => {
      const searchInput = this.appRoot.querySelector('#home-search-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  async renderHomeSearchResults(container, query) {
    const allQuestions = await this.fetchAllQuestions();
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

    // Find questions where every token matches at least one field
    const allMatches = allQuestions.filter(q => {
      const targetText = [
        q.question,
        q.answer,
        q.explanation_bn,
        q.topic,
        q.chapterTitle
      ].filter(Boolean).join(' ').toLowerCase();

      return tokens.every(token => targetText.includes(token));
    });

    // Count per chapter
    const chapterCounts = {};
    allMatches.forEach(q => {
      chapterCounts[q.chapterId] = (chapterCounts[q.chapterId] || 0) + 1;
    });

    // Filter by selected chapter pill
    let filteredMatches = allMatches;
    if (this.homeSearchFilter !== 'all') {
      filteredMatches = allMatches.filter(q => q.chapterId === this.homeSearchFilter);
    }

    // Filter pills HTML
    const matchedChapters = this.chapters.filter(ch => (chapterCounts[ch.id] || 0) > 0);
    let filterPillsHtml = '';
    if (allMatches.length > 0 && matchedChapters.length > 1) {
      filterPillsHtml = `
        <div class="search-filter-bar">
          <button type="button" class="search-filter-chip ${this.homeSearchFilter === 'all' ? 'active' : ''}" data-filter="all">
            All (${allMatches.length})
          </button>
          ${matchedChapters.map(ch => `
            <button type="button" class="search-filter-chip ${this.homeSearchFilter === ch.id ? 'active' : ''}" data-filter="${ch.id}">
              ${this.escapeHtml(ch.title.replace(/ (Rapid Recall|Quick Recap)/i, '').replace(/ All \d+ Explained/i, ''))} (${chapterCounts[ch.id]})
            </button>
          `).join('')}
        </div>
      `;
    }

    if (allMatches.length === 0) {
      container.innerHTML = `
        <div class="search-empty-state">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</div>
          <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.35rem;">No questions matched</h3>
          <p class="text-muted" style="font-size: 0.85rem; max-width: 320px; margin: 0 auto 1.25rem auto;">
            No questions matched "<strong>${this.escapeHtml(query)}</strong>". Try searching for symptoms, diseases, medications, or Bengali terms.
          </p>
          <button class="btn btn-secondary btn-sm" id="btn-empty-clear-search">Clear Search</button>
        </div>
      `;
      container.querySelector('#btn-empty-clear-search')?.addEventListener('click', () => {
        this.clearHomeSearch();
      });
      return;
    }

    const cardsHtml = filteredMatches.map(q => {
      const questionKey = this.getQuestionKey(q);
      const isBookmarked = Storage.isFlagged(questionKey);

      return `
        <div class="search-result-card selectable" data-chapter-id="${q.chapterId}" data-original-index="${q.originalIndex}">
          <div class="search-result-header">
            <span class="chapter-badge" style="font-size: 0.72rem;">${this.escapeHtml(q.chapterTitle || q.topic || 'General')}</span>
            <button class="icon-btn search-flag-btn ${isBookmarked ? 'active' : ''}" data-key="${this.escapeHtml(questionKey)}" data-qid="${q.id}" title="Flag Question" style="width: 32px; height: 32px; font-size: 0.9rem;">
              ${isBookmarked ? '★' : '☆'}
            </button>
          </div>

          <div class="search-result-question">${this.highlightMatch(q.question, query)}</div>
          
          <div class="search-result-answer">
            🎯 ${this.highlightMatch(q.answer, query)}
          </div>

          ${q.explanation_bn ? `
            <div class="search-result-explanation">
              ${this.highlightMatch(q.explanation_bn, query)}
            </div>
          ` : ''}

          <div class="search-result-footer">
            <span class="text-muted" style="font-size: 0.75rem;">Question #${q.originalIndex + 1}</span>
            <span style="font-size: 0.8rem; font-weight: 600; color: var(--accent);">Study in Chapter →</span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      ${filterPillsHtml}
      
      <div class="search-results-header">
        <div class="search-count-text">
          Found <strong>${filteredMatches.length}</strong> question${filteredMatches.length === 1 ? '' : 's'}
          ${this.homeSearchFilter !== 'all' ? `in <em>${this.escapeHtml(this.chapters.find(c => c.id === this.homeSearchFilter)?.title || '')}</em>` : ''}
        </div>
        <button class="btn btn-primary btn-sm" id="btn-study-search-batch">
          📖 Study All (${filteredMatches.length})
        </button>
      </div>

      <div class="search-results-list">
        ${cardsHtml}
      </div>
    `;

    // Bind filter chips
    container.querySelectorAll('.search-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.homeSearchFilter = chip.getAttribute('data-filter');
        this.updateHomeMainContent();
      });
    });

    // Bind Study Batch
    container.querySelector('#btn-study-search-batch')?.addEventListener('click', () => {
      this.startStudyMode('search_results', filteredMatches, `Search: "${query}"`, 0);
    });

    // Bind Card clicks & Flag buttons
    container.querySelectorAll('.search-result-card').forEach(card => {
      const chId = card.getAttribute('data-chapter-id');
      const origIdx = parseInt(card.getAttribute('data-original-index'), 10);
      const q = allQuestions.find(item => item.chapterId === chId && item.originalIndex === origIdx);

      card.addEventListener('click', (e) => {
        if (e.target.closest('.search-flag-btn')) return;
        this.startStudyMode(chId, null, null, origIdx);
      });

      const flagBtn = card.querySelector('.search-flag-btn');
      if (flagBtn && q) {
        flagBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const qKey = this.getQuestionKey(q);
          const active = Storage.toggleFlag(qKey, q);
          flagBtn.classList.toggle('active', active);
          flagBtn.textContent = active ? '★' : '☆';
        });
      }
    });
  }

  // --- VIEW: STUDY MODE ---
  async startStudyMode(chapterId, customQuestions = null, customTitle = null, startIndex = null) {
    if (customQuestions) {
      this.currentChapter = { id: chapterId, title: customTitle || 'Custom Review' };
      this.currentQuestions = customQuestions;
      this.currentIndex = (startIndex !== null && startIndex >= 0) ? Math.min(startIndex, customQuestions.length - 1) : 0;
    } else {
      const ch = this.chapters.find(c => c.id === chapterId);
      if (!ch) return;
      this.currentChapter = ch;
      this.currentQuestions = await this.fetchChapterQuestions(ch);
      if (startIndex !== null && startIndex >= 0) {
        this.currentIndex = Math.min(startIndex, Math.max(0, this.currentQuestions.length - 1));
      } else {
        const prog = Storage.getProgress(chapterId);
        this.currentIndex = Math.min(prog.lastIndex || 0, Math.max(0, this.currentQuestions.length - 1));
      }
    }

    if (this.currentQuestions.length === 0) {
      alert('No questions found in this chapter.');
      return;
    }

    this.view = 'study';
    if (this.backBtn) this.backBtn.style.display = 'inline-flex';
    this.renderStudyCard();
  }

  renderStudyCard() {
    if (this.currentIndex >= this.currentQuestions.length) {
      this.currentIndex = this.currentQuestions.length - 1;
    }
    if (this.currentIndex < 0) this.currentIndex = 0;

    const q = this.currentQuestions[this.currentIndex];
    const total = this.currentQuestions.length;
    const currentNum = this.currentIndex + 1;
    const progressPercent = (currentNum / total) * 100;

    this.setProgressBar(progressPercent);
    if (this.headerTitle) {
      this.headerTitle.textContent = this.currentChapter ? this.currentChapter.title : 'Study Mode';
    }

    // Save reading progress in cache
    if (this.currentChapter && this.currentChapter.id) {
      Storage.saveProgress(this.currentChapter.id, this.currentIndex, total);
    }

    const questionKey = this.getQuestionKey(q);
    const isBookmarked = Storage.isFlagged(questionKey);

    this.appRoot.innerHTML = `
      <div class="study-viewport">
        <div class="study-card selectable" id="study-card-element">
          <div class="study-card-top">
            <span class="study-counter">QUESTION ${currentNum} OF ${total}</span>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <span class="chapter-badge" style="font-size: 0.7rem;">${q.topic || 'General'}</span>
              <button class="icon-btn ${isBookmarked ? 'active' : ''}" id="btn-toggle-flag" title="Flag as Important">
                ${isBookmarked ? '★' : '☆'}
              </button>
            </div>
          </div>

          <!-- Question as Headline -->
          <h1 class="study-headline">${q.question}</h1>

          <!-- Answer as Subheadline -->
          <div class="study-subheadline-box">
            <div class="study-subheadline-label">High-Yield Answer</div>
            <div class="study-subheadline-text">${q.answer}</div>
          </div>

          <!-- Explanation in Unicode Bengali -->
          <div class="study-explanation-box">
            <div class="study-explanation-label">
              <span>💡</span> ব্যাখ্যা (Bengali Explanation)
            </div>
            <p class="study-explanation-text">${q.explanation_bn}</p>
          </div>
        </div>

        <!-- Touch Swipe & Action Footer -->
        <div class="study-nav-footer">
          <button class="btn btn-secondary" id="btn-prev-q" ${this.currentIndex === 0 ? 'disabled style="opacity:0.4"' : ''}>
            ← Previous
          </button>
          
          <div class="swipe-hint">
            <span>👉 Swipe right to next</span>
          </div>

          <button class="btn btn-primary" id="btn-next-q">
            ${currentNum === total ? 'Finished 🎉' : 'Next →'}
          </button>
        </div>
      </div>
    `;

    // Clean previous swipe listener and attach new one
    if (this.swipeCleanup) this.swipeCleanup();
    const cardEl = document.getElementById('study-card-element');
    this.swipeCleanup = attachSwipeListener(cardEl, {
      onNext: () => this.nextQuestion(),
      onPrev: () => this.prevQuestion()
    });

    // Event listeners
    document.getElementById('btn-next-q')?.addEventListener('click', () => this.nextQuestion());
    document.getElementById('btn-prev-q')?.addEventListener('click', () => this.prevQuestion());
    document.getElementById('btn-toggle-flag')?.addEventListener('click', () => {
      const active = Storage.toggleFlag(questionKey, q);
      const btn = document.getElementById('btn-toggle-flag');
      if (btn) {
        btn.classList.toggle('active', active);
        btn.textContent = active ? '★' : '☆';
      }
    });
  }

  nextQuestion() {
    if (this.currentIndex < this.currentQuestions.length - 1) {
      this.currentIndex++;
      this.renderStudyCard();
    } else {
      alert('🎉 You have reached the end of this chapter! Great job!');
    }
  }

  prevQuestion() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderStudyCard();
    }
  }

  // --- VIEW: EXAM MODE ---
  async startExamMode(chapterId) {
    const ch = this.chapters.find(c => c.id === chapterId);
    if (!ch) return;
    const questions = await this.fetchChapterQuestions(ch);
    this.promptExamConfig(questions, ch.title, ch.id);
  }

  async startGrandExam() {
    const allQuestions = await this.fetchAllQuestions();
    if (allQuestions.length === 0) {
      alert('No questions loaded for Grand Exam.');
      return;
    }
    this.promptExamConfig(allQuestions, 'Grand Exam (All Topics)', 'grand_exam');
  }

  promptExamConfig(questionPool, examTitle, examId) {
    if (!questionPool || questionPool.length === 0) {
      alert('No questions available for this exam.');
      return;
    }

    const totalAvailable = questionPool.length;
    let selectedCount = Math.min(20, totalAvailable);

    // Preset size options
    const presets = [10, 20, 30, 50].filter(n => n < totalAvailable);
    if (!presets.includes(totalAvailable)) {
      presets.push(totalAvailable); // "All"
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'exam-config-modal';

    const pillsHtml = presets.map(count => {
      const isAll = count === totalAvailable;
      const label = isAll ? `All (${count})` : `${count}`;
      const isActive = count === selectedCount;
      return `<button type="button" class="pill-btn ${isActive ? 'active' : ''}" data-count="${count}">${label}</button>`;
    }).join('');

    modal.innerHTML = `
      <div class="modal-content">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <h3 style="font-size: 1.2rem; font-weight: 800;">⚙️ Exam Configuration</h3>
          <button class="icon-btn" id="btn-close-exam-config">✕</button>
        </div>

        <div style="font-size: 0.95rem; font-weight: 700; color: var(--accent); margin-bottom: 0.25rem;">
          ${examTitle}
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          Available question pool: <strong>${totalAvailable}</strong> questions
        </div>

        <label style="font-size: 0.88rem; font-weight: 700; display: block; margin-bottom: 0.5rem;">
          Set Number of Questions for this Exam:
        </label>

        <div class="exam-size-pills" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem;">
          ${pillsHtml}
        </div>

        <div style="margin-bottom: 1.25rem;">
          <label style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">
            Or enter custom question count (1 to ${totalAvailable}):
          </label>
          <input type="number" id="input-exam-size" min="1" max="${totalAvailable}" value="${selectedCount}"
            style="width: 100%; padding: 0.65rem 0.85rem; border-radius: var(--radius-md); border: 2px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); font-size: 1rem; outline: none;">
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary" id="btn-cancel-exam-config" style="flex: 1;">Cancel</button>
          <button class="btn btn-primary" id="btn-start-shuffled-exam" style="flex: 2;">
            🔀 Start Shuffled Exam (<span id="config-btn-count">${selectedCount}</span>)
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const input = modal.querySelector('#input-exam-size');
    const badge = modal.querySelector('#config-btn-count');

    const updateCount = (newCount) => {
      selectedCount = Math.max(1, Math.min(totalAvailable, parseInt(newCount, 10) || 1));
      input.value = selectedCount;
      badge.textContent = selectedCount;

      modal.querySelectorAll('.pill-btn').forEach(pill => {
        const c = parseInt(pill.getAttribute('data-count'), 10);
        pill.classList.toggle('active', c === selectedCount);
      });
    };

    modal.querySelectorAll('.pill-btn').forEach(pill => {
      pill.addEventListener('click', () => {
        const c = parseInt(pill.getAttribute('data-count'), 10);
        updateCount(c);
      });
    });

    input.addEventListener('input', () => {
      updateCount(input.value);
    });

    modal.querySelector('#btn-close-exam-config')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#btn-cancel-exam-config')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    modal.querySelector('#btn-start-shuffled-exam')?.addEventListener('click', () => {
      modal.remove();
      this.initiateExam(questionPool, examTitle, examId, selectedCount);
    });
  }

  initiateExam(questionPool, examTitle, examId, examSize = null) {
    // Generate MCQ list with authentic distractors and randomized options
    // Both questions order and options order are newly shuffled each time!
    const targetSize = examSize ? Math.min(examSize, questionPool.length) : null;
    const mcqList = generateMcqExam(questionPool, targetSize, questionPool);
    
    this.view = 'exam';
    this.activeExam = {
      id: examId,
      title: examTitle,
      rawPool: questionPool,
      examSize: targetSize || mcqList.length,
      questions: mcqList,
      total: mcqList.length
    };
    this.examCurrentIndex = 0;
    this.examUserAnswers = new Array(mcqList.length).fill(null);
    this.examStartTime = Date.now();

    if (this.backBtn) this.backBtn.style.display = 'inline-flex';
    this.startExamTimer();
    this.renderExamQuestion();
  }

  startExamTimer() {
    clearInterval(this.examTimerInterval);
    this.examTimerInterval = setInterval(() => {
      const timerEl = document.getElementById('exam-timer-display');
      if (timerEl && this.examStartTime) {
        const elapsed = Math.floor((Date.now() - this.examStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        timerEl.textContent = `⏱️ ${mins}:${secs}`;
      }
    }, 1000);
  }

  renderExamQuestion() {
    const q = this.activeExam.questions[this.examCurrentIndex];
    const total = this.activeExam.total;
    const currentNum = this.examCurrentIndex + 1;
    const selectedAnsIndex = this.examUserAnswers[this.examCurrentIndex];

    this.setProgressBar((currentNum / total) * 100);
    if (this.headerTitle) {
      this.headerTitle.textContent = `${this.activeExam.title}`;
    }

    const optionsHtml = q.options.map((optText, optIdx) => {
      const letter = String.fromCharCode(65 + optIdx); // 'A', 'B', 'C', 'D'
      const isSelected = selectedAnsIndex === optIdx;
      return `
        <button class="mcq-option-btn ${isSelected ? 'selected' : ''}" data-opt-idx="${optIdx}">
          <span class="mcq-option-letter">${letter}</span>
          <span>${optText}</span>
        </button>
      `;
    }).join('');

    this.appRoot.innerHTML = `
      <div class="exam-header">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span class="font-bold" style="font-size: 0.9rem;">QUESTION ${currentNum} / ${total}</span>
          <button class="btn btn-secondary btn-sm" id="btn-exam-finish-early" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" title="Submit and review explanations now">
            Submit Early
          </button>
        </div>
        <span class="exam-timer" id="exam-timer-display">⏱️ 00:00</span>
      </div>

      <div class="mcq-question-card selectable">
        <div style="font-size: 0.8rem; color: var(--accent); font-weight: 700; margin-bottom: 0.5rem; text-transform: uppercase;">
          ${q.topic || 'Medical Knowledge'}
        </div>
        <h2 style="font-size: 1.25rem; font-weight: 800; line-height: 1.4; color: var(--text-primary);">
          ${q.question}
        </h2>
      </div>

      <div class="mcq-options-list">
        ${optionsHtml}
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; gap: 1rem;">
        <button class="btn btn-secondary" id="btn-exam-prev" ${this.examCurrentIndex === 0 ? 'disabled style="opacity:0.4"' : ''}>
          ← Previous
        </button>

        <button class="btn btn-primary" id="btn-exam-next" style="min-width: 130px;">
          ${currentNum === total ? 'Submit Exam ✓' : 'Next Question →'}
        </button>
      </div>
    `;

    // Handle option selection
    this.appRoot.querySelectorAll('.mcq-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-opt-idx'), 10);
        this.examUserAnswers[this.examCurrentIndex] = idx;
        if (navigator.vibrate) navigator.vibrate(10);
        this.renderExamQuestion();
      });
    });

    document.getElementById('btn-exam-prev')?.addEventListener('click', () => {
      if (this.examCurrentIndex > 0) {
        this.examCurrentIndex--;
        this.renderExamQuestion();
      }
    });

    document.getElementById('btn-exam-finish-early')?.addEventListener('click', () => {
      if (confirm('Do you want to submit your exam now and view results and explanations?')) {
        this.finishExam();
      }
    });

    document.getElementById('btn-exam-next')?.addEventListener('click', () => {
      if (currentNum === total) {
        this.finishExam();
      } else {
        this.examCurrentIndex++;
        this.renderExamQuestion();
      }
    });
  }

  finishExam() {
    clearInterval(this.examTimerInterval);
    const elapsedSeconds = Math.floor((Date.now() - this.examStartTime) / 1000);
    const questions = this.activeExam.questions;
    let score = 0;

    questions.forEach((q, idx) => {
      const userChoice = this.examUserAnswers[idx];
      const isCorrect = userChoice === q.correctIndex;
      if (isCorrect) score++;

      // Record in storage (Hard Questions / Mistake Bank logic)
      const questionKey = this.getQuestionKey(q.rawItem);
      Storage.recordExamResult(questionKey, isCorrect, q.rawItem);
    });

    this.renderExamReview(score, questions.length, elapsedSeconds);
  }

  // --- VIEW: POST-EXAM REVIEW ---
  renderExamReview(score, total, elapsedSeconds) {
    this.view = 'review';
    this.setProgressBar(100);
    if (this.headerTitle) this.headerTitle.textContent = 'Exam Results & Review';

    const percent = Math.round((score / total) * 100);
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    const timeFormatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    const missedQuestions = this.activeExam.questions
      .filter((q, idx) => this.examUserAnswers[idx] !== q.correctIndex)
      .map(q => q.rawItem);

    let reviewCardsHtml = this.activeExam.questions.map((q, idx) => {
      const userChoice = this.examUserAnswers[idx];
      const isCorrect = userChoice === q.correctIndex;
      const userChoiceText = userChoice !== null ? q.options[userChoice] : 'Unanswered';
      const questionKey = this.getQuestionKey(q.rawItem);
      const isBookmarked = Storage.isFlagged(questionKey);

      return `
        <div class="review-card ${isCorrect ? 'correct' : 'incorrect'} selectable">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
            <span style="font-size: 0.8rem; font-weight: 700; color: ${isCorrect ? 'var(--success)' : 'var(--danger)'};">
              ${isCorrect ? '✓ CORRECT' : '✗ INCORRECT'} • Q${idx + 1}
            </span>
            <button class="icon-btn btn-review-flag ${isBookmarked ? 'active' : ''}" data-key="${questionKey}" title="Bookmark">
              ${isBookmarked ? '★' : '☆'}
            </button>
          </div>

          <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.75rem; color: var(--text-primary);">
            ${q.question}
          </h3>

          <div style="font-size: 0.9rem; margin-bottom: 0.4rem;">
            <strong>Your Answer:</strong> 
            <span class="${isCorrect ? 'text-success' : 'text-danger'}" style="font-weight: 600;">
              ${userChoiceText}
            </span>
          </div>

          ${!isCorrect ? `
            <div style="font-size: 0.9rem; margin-bottom: 0.75rem;">
              <strong>Correct Answer:</strong> 
              <span class="text-success" style="font-weight: 700;">${q.correctAnswer}</span>
            </div>
          ` : ''}

          <!-- Bengali Explanation Revealed After Exam -->
          <div style="margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px dashed var(--border-color);">
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.3rem;">
              💡 ব্যাখ্যা (Bengali Explanation):
            </div>
            <div style="font-family: var(--font-bn); font-size: 0.98rem; line-height: 1.7; color: var(--text-secondary); white-space: pre-line;">
              ${q.explanation_bn}
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.appRoot.innerHTML = `
      <div class="review-score-hero">
        <div style="font-size: 2.75rem; font-weight: 800; line-height: 1;">${percent}%</div>
        <div style="font-size: 1.15rem; font-weight: 600; margin-top: 0.35rem;">
          ${score} / ${total} Correct
        </div>
        <div style="font-size: 0.85rem; opacity: 0.85; margin-top: 0.2rem;">
          Time: ${timeFormatted} • ${percent >= 70 ? '🎉 Excellent Recap!' : 'Keep practicing to master weak areas!'}
        </div>
      </div>

      <!-- Action buttons with prominent Shuffle options -->
      <div style="display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 1.5rem;">
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-primary" id="btn-review-shuffle" style="flex: 2; background: linear-gradient(135deg, #2563eb, #7c3aed);">
            🔀 Shuffle & Retake (${total} Qs)
          </button>
          <button class="btn btn-secondary" id="btn-review-change-size" style="flex: 1;" title="Change Question Count">
            ⚙️ Set Qs
          </button>
        </div>

        ${missedQuestions.length > 0 ? `
          <button class="btn btn-secondary" id="btn-review-shuffle-missed" style="border-color: var(--danger); color: var(--danger); font-weight: 700;">
            🔥 Shuffle Missed Questions Only (${missedQuestions.length})
          </button>
        ` : ''}

        <button class="btn btn-secondary" id="btn-review-home">
          🏠 Back to Home
        </button>
      </div>

      <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 1rem;">
        Detailed Question Review & Explanations:
      </h3>

      <div class="review-list">
        ${reviewCardsHtml}
      </div>

      <div style="margin-top: 1.5rem; margin-bottom: 2rem; display: flex; flex-direction: column; gap: 0.6rem;">
        <button class="btn btn-primary" id="btn-review-bottom-shuffle" style="background: linear-gradient(135deg, #2563eb, #7c3aed);">
          🔀 Shuffle & Retake Exam (${total} Qs)
        </button>
        <button class="btn btn-secondary" id="btn-review-bottom-home">
          🏠 Back to Home
        </button>
      </div>
    `;

    document.getElementById('btn-review-home')?.addEventListener('click', () => this.renderHome());
    document.getElementById('btn-review-bottom-home')?.addEventListener('click', () => this.renderHome());

    // Shuffle & Retake: fresh randomized question order and fresh shuffled options
    const handleShuffleRetake = () => {
      this.initiateExam(this.activeExam.rawPool, this.activeExam.title, this.activeExam.id, this.activeExam.examSize);
    };

    document.getElementById('btn-review-shuffle')?.addEventListener('click', handleShuffleRetake);
    document.getElementById('btn-review-bottom-shuffle')?.addEventListener('click', handleShuffleRetake);

    document.getElementById('btn-review-change-size')?.addEventListener('click', () => {
      this.promptExamConfig(this.activeExam.rawPool, this.activeExam.title, this.activeExam.id);
    });

    document.getElementById('btn-review-shuffle-missed')?.addEventListener('click', () => {
      this.initiateExam(missedQuestions, `${this.activeExam.title} (Missed Drill)`, `${this.activeExam.id}_missed`, missedQuestions.length);
    });

    this.appRoot.querySelectorAll('.btn-review-flag').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        const qItem = this.activeExam.questions.find(q => this.getQuestionKey(q.rawItem) === key)?.rawItem;
        const active = Storage.toggleFlag(key, qItem);
        btn.classList.toggle('active', active);
        btn.textContent = active ? '★' : '☆';
      });
    });
  }

  // --- VIEW: HARD QUESTIONS BANK ---
  renderHardQuestions() {
    this.view = 'hard';
    this.setProgressBar(0);
    if (this.backBtn) this.backBtn.style.display = 'inline-flex';
    if (this.headerTitle) this.headerTitle.textContent = 'Hard Questions (Mistake Bank)';

    const hardList = Storage.getHardQuestions();

    if (hardList.length === 0) {
      this.appRoot.innerHTML = `
        <div class="text-center" style="padding: 3rem 1rem;">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">🎉</div>
          <h2 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 0.5rem;">No Hard Questions Yet!</h2>
          <p class="text-muted" style="font-size: 0.9rem; max-width: 380px; margin: 0 auto 1.5rem auto;">
            Questions you answer incorrectly during exams will automatically appear here for spaced memorization and dedicated drill.
          </p>
          <button class="btn btn-primary" id="btn-hard-back">Go to Home</button>
        </div>
      `;
      document.getElementById('btn-hard-back')?.addEventListener('click', () => this.renderHome());
      return;
    }

    const itemsHtml = hardList.map((item, idx) => `
      <div class="chapter-card selectable" style="border-left: 4px solid var(--danger);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--danger); background: var(--danger-light); padding: 0.2rem 0.5rem; border-radius: 999px;">
            🔥 Missed ${item.wrongCount} time${item.wrongCount > 1 ? 's' : ''}
          </span>
          <span class="chapter-badge" style="font-size: 0.7rem;">${item.topic || 'General'}</span>
        </div>

        <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin-top: 0.25rem;">
          ${item.question}
        </h3>

        <div style="font-size: 0.95rem; font-weight: 700; color: var(--accent);">
          Answer: ${item.answer}
        </div>

        <div style="font-family: var(--font-bn); font-size: 0.92rem; line-height: 1.6; color: var(--text-secondary); white-space: pre-line; border-top: 1px dashed var(--border-color); padding-top: 0.5rem;">
          ${item.explanation_bn}
        </div>
      </div>
    `).join('');

    this.appRoot.innerHTML = `
      <div style="margin-bottom: 1.25rem; display: flex; gap: 0.5rem;">
        <button class="btn btn-primary" id="btn-drill-hard" style="flex: 1;">
          ⚡ Drill Mistakes in Study Mode (${hardList.length})
        </button>
        <button class="btn btn-secondary" id="btn-exam-hard" style="flex: 1;">
          📝 Hard Exam Drill
        </button>
      </div>

      <div class="hard-list">
        ${itemsHtml}
      </div>
    `;

    document.getElementById('btn-drill-hard')?.addEventListener('click', () => {
      this.startStudyMode('hard_questions', hardList, 'Hard Questions Drill');
    });

    document.getElementById('btn-exam-hard')?.addEventListener('click', () => {
      this.promptExamConfig(hardList, 'Hard Questions Mistake Drill', 'hard_drill');
    });
  }

  // --- VIEW: FLAGGED QUESTIONS (BOOKMARKS) ---
  renderFlaggedQuestions() {
    this.view = 'flagged';
    this.setProgressBar(0);
    if (this.backBtn) this.backBtn.style.display = 'inline-flex';
    if (this.headerTitle) this.headerTitle.textContent = 'Flagged Questions (★)';

    const flaggedList = Storage.getFlaggedQuestions();

    if (flaggedList.length === 0) {
      this.appRoot.innerHTML = `
        <div class="text-center" style="padding: 3rem 1rem;">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">⭐</div>
          <h2 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 0.5rem;">No Flagged Questions</h2>
          <p class="text-muted" style="font-size: 0.9rem; max-width: 380px; margin: 0 auto 1.5rem auto;">
            Star any high-yield or difficult question in study mode or after an exam to quickly access it here.
          </p>
          <button class="btn btn-primary" id="btn-flagged-back">Go to Home</button>
        </div>
      `;
      document.getElementById('btn-flagged-back')?.addEventListener('click', () => this.renderHome());
      return;
    }

    const itemsHtml = flaggedList.map((item) => `
      <div class="chapter-card selectable" style="border-left: 4px solid var(--warning);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--warning); background: var(--warning-light); padding: 0.2rem 0.5rem; border-radius: 999px;">
            ⭐ Flagged
          </span>
          <span class="chapter-badge" style="font-size: 0.7rem;">${item.topic || 'General'}</span>
        </div>

        <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin-top: 0.25rem;">
          ${item.question}
        </h3>

        <div style="font-size: 0.95rem; font-weight: 700; color: var(--accent);">
          Answer: ${item.answer}
        </div>

        <div style="font-family: var(--font-bn); font-size: 0.92rem; line-height: 1.6; color: var(--text-secondary); white-space: pre-line; border-top: 1px dashed var(--border-color); padding-top: 0.5rem;">
          ${item.explanation_bn}
        </div>
      </div>
    `).join('');

    this.appRoot.innerHTML = `
      <div style="margin-bottom: 1.25rem; display: flex; gap: 0.5rem;">
        <button class="btn btn-primary" id="btn-drill-flagged" style="flex: 1;">
          📖 Study Flagged (${flaggedList.length})
        </button>
        <button class="btn btn-secondary" id="btn-exam-flagged" style="flex: 1;">
          📝 Exam on Flagged
        </button>
      </div>

      <div class="flagged-list">
        ${itemsHtml}
      </div>
    `;

    document.getElementById('btn-drill-flagged')?.addEventListener('click', () => {
      this.startStudyMode('flagged_questions', flaggedList, 'Flagged Questions Study');
    });

    document.getElementById('btn-exam-flagged')?.addEventListener('click', () => {
      this.promptExamConfig(flaggedList, 'Flagged Questions Exam', 'flagged_exam');
    });
  }

  // --- SEARCH MODAL ---
  async renderSearchModal() {
    const allQuestions = await this.fetchAllQuestions();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'search-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-height: 85vh; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="font-size: 1.15rem; font-weight: 800;">Quick Question Search</h3>
          <button class="icon-btn" id="btn-close-search">✕</button>
        </div>

        <input type="search" id="search-input" placeholder="Type keyword (e.g., stroke, MI, asthma)..." 
          style="width: 100%; padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 2px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); font-size: 1rem; margin-bottom: 1rem; outline: none;">

        <div id="search-results-list" style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 0.75rem;">
          <div class="text-muted text-center" style="padding: 2rem 0;">Type at least 2 characters to search across all chapters</div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const input = modal.querySelector('#search-input');
    const resultsContainer = modal.querySelector('#search-results-list');
    input.focus();

    modal.querySelector('#btn-close-search').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    input.addEventListener('input', () => {
      const rawQuery = input.value.trim();
      const query = rawQuery.toLowerCase();
      if (query.length < 2) {
        resultsContainer.innerHTML = `<div class="text-muted text-center" style="padding: 2rem 0;">Type at least 2 characters to search</div>`;
        return;
      }

      const tokens = query.split(/\s+/).filter(Boolean);
      const matches = allQuestions.filter(q => {
        const targetText = [
          q.question,
          q.answer,
          q.explanation_bn,
          q.topic,
          q.chapterTitle
        ].filter(Boolean).join(' ').toLowerCase();

        return tokens.every(token => targetText.includes(token));
      }).slice(0, 40);

      if (matches.length === 0) {
        resultsContainer.innerHTML = `<div class="text-muted text-center" style="padding: 2rem 0;">No matching questions found</div>`;
        return;
      }

      resultsContainer.innerHTML = matches.map((m) => `
        <div class="chapter-card selectable modal-search-item" data-chapter-id="${m.chapterId}" data-original-index="${m.originalIndex}" style="padding: 0.85rem; margin-bottom: 0; cursor: pointer;">
          <div style="font-size: 0.75rem; color: var(--accent); font-weight: 700;">${this.escapeHtml(m.chapterTitle || m.topic)}</div>
          <div style="font-size: 0.95rem; font-weight: 700; margin: 0.2rem 0;">${this.highlightMatch(m.question, rawQuery)}</div>
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--success);">${this.highlightMatch(m.answer, rawQuery)}</div>
        </div>
      `).join('');

      resultsContainer.querySelectorAll('.modal-search-item').forEach(item => {
        item.addEventListener('click', () => {
          const chId = item.getAttribute('data-chapter-id');
          const origIdx = parseInt(item.getAttribute('data-original-index'), 10);
          modal.remove();
          this.startStudyMode(chId, null, null, origIdx);
        });
      });
    });
  }
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new QuickRecapApp();
  window.RapidRecallApp = QuickRecapApp;
  window.QuickRecapApp = QuickRecapApp;
  window.app.init();
});

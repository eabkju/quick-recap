/**
 * Storage Manager for Quick Recap App
 * Handles reading progress, mistakes ("Hard Questions"), bookmarks ("Flagged"), and settings.
 */

const STORAGE_KEYS = {
  READING_PROGRESS: 'rr_reading_progress',
  QUESTION_STATS: 'rr_question_stats',
  FLAGGED_QUESTIONS: 'rr_flagged_questions',
  EXAM_HISTORY: 'rr_exam_history',
  SETTINGS: 'rr_settings'
};

export const Storage = {
  // Reading Progress per Chapter
  getProgress(chapterId) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.READING_PROGRESS) || '{}');
      return all[chapterId] || { lastIndex: 0, completed: [] };
    } catch {
      return { lastIndex: 0, completed: [] };
    }
  },

  saveProgress(chapterId, currentIndex, totalQuestions) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.READING_PROGRESS) || '{}');
      const current = all[chapterId] || { lastIndex: 0, completed: [] };
      current.lastIndex = currentIndex;
      if (!current.completed.includes(currentIndex)) {
        current.completed.push(currentIndex);
      }
      current.lastUpdated = Date.now();
      current.totalQuestions = totalQuestions;
      all[chapterId] = current;
      localStorage.setItem(STORAGE_KEYS.READING_PROGRESS, JSON.stringify(all));
    } catch (e) {
      console.error('Error saving reading progress:', e);
    }
  },

  getAllProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.READING_PROGRESS) || '{}');
    } catch {
      return {};
    }
  },

  // Question Stats & "Hard Questions" Tracking
  getQuestionStats() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.QUESTION_STATS) || '{}');
    } catch {
      return {};
    }
  },

  recordExamResult(questionKey, isCorrect, questionObj) {
    try {
      const stats = this.getQuestionStats();
      const current = stats[questionKey] || {
        wrongCount: 0,
        correctCount: 0,
        streak: 0,
        question: questionObj.question,
        answer: questionObj.answer,
        explanation_bn: questionObj.explanation_bn,
        topic: questionObj.topic,
        chapterId: questionObj.chapterId,
        lastAttempt: Date.now()
      };

      if (isCorrect) {
        current.correctCount = (current.correctCount || 0) + 1;
        current.streak = (current.streak || 0) + 1;
        // If answered correctly 2 times consecutively after being wrong, graduate from Hard list
        if (current.streak >= 2 && current.wrongCount > 0) {
          current.isMastered = true;
        }
      } else {
        current.wrongCount = (current.wrongCount || 0) + 1;
        current.streak = 0;
        current.isMastered = false;
      }
      current.lastAttempt = Date.now();
      stats[questionKey] = current;
      localStorage.setItem(STORAGE_KEYS.QUESTION_STATS, JSON.stringify(stats));
    } catch (e) {
      console.error('Error recording exam result:', e);
    }
  },

  getHardQuestions() {
    const stats = this.getQuestionStats();
    return Object.entries(stats)
      .filter(([_, data]) => (data.wrongCount > 0 && !data.isMastered))
      .map(([key, data]) => ({ key, ...data }))
      .sort((a, b) => b.wrongCount - a.wrongCount);
  },

  clearHardQuestion(questionKey) {
    const stats = this.getQuestionStats();
    if (stats[questionKey]) {
      stats[questionKey].wrongCount = 0;
      stats[questionKey].isMastered = true;
      localStorage.setItem(STORAGE_KEYS.QUESTION_STATS, JSON.stringify(stats));
    }
  },

  // Flagged / Important Questions (Bookmarks)
  getFlaggedKeys() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.FLAGGED_QUESTIONS) || '[]');
    } catch {
      return [];
    }
  },

  isFlagged(questionKey) {
    const flags = this.getFlaggedKeys();
    return flags.includes(questionKey);
  },

  toggleFlag(questionKey, questionObj) {
    let flags = this.getFlaggedKeys();
    const stats = this.getQuestionStats();
    
    if (flags.includes(questionKey)) {
      flags = flags.filter(k => k !== questionKey);
    } else {
      flags.push(questionKey);
      // Ensure question details are cached in stats for easy retrieval
      if (!stats[questionKey] && questionObj) {
        stats[questionKey] = {
          wrongCount: 0,
          correctCount: 0,
          streak: 0,
          question: questionObj.question,
          answer: questionObj.answer,
          explanation_bn: questionObj.explanation_bn,
          topic: questionObj.topic,
          chapterId: questionObj.chapterId,
          lastAttempt: Date.now()
        };
        localStorage.setItem(STORAGE_KEYS.QUESTION_STATS, JSON.stringify(stats));
      }
    }
    localStorage.setItem(STORAGE_KEYS.FLAGGED_QUESTIONS, JSON.stringify(flags));
    return flags.includes(questionKey);
  },

  getFlaggedQuestions() {
    const flags = this.getFlaggedKeys();
    const stats = this.getQuestionStats();
    return flags.map(k => ({ key: k, ...(stats[k] || {}) })).filter(q => q.question);
  },

  // Settings
  getTheme() {
    return localStorage.getItem(STORAGE_KEYS.SETTINGS + '_theme') || 'system';
  },

  setTheme(theme) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS + '_theme', theme);
  }
};

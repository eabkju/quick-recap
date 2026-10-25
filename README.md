# 🩺 Medical Rapid Recall Web App

A high-yield medical learning and exam preparation web application built for rapid memorization, active recall, and adaptive self-examination.

---

## 🚀 Quick Start

To launch the web app:

```bash
~/start-rapid-recall.sh
```

or inside the project folder:

```bash
cd ~/rapid-recall-app
./start.sh
```

Then open your browser and navigate to:
👉 **`http://localhost:8080`**

---

## 📂 Database & Adding New Chapters

The app stores all questions in the `database/` folder:
```
rapid-recall-app/database/
├── cardiology_rapid_recall_all_99_explained.json
├── neurology_rapid_recall_all_46_explained.json
├── respiratory_rapid_recall_all_70_explained.json
└── manifest.json   (auto-generated)
```

### Adding New Chapters
Whenever you want to add a new topic:
1. Place any new `.json` file inside `database/` (e.g. `gastroenterology_rapid_recall.json`).
2. Run or restart `server.py` (or refresh the page).
3. The app **automatically names the chapter based on the file name** and loads all questions into the study and exam systems.

---

## ✨ Features

- **📖 Swipeable Study Reader**:
  - **Question as Headline**: High-contrast, bold question title.
  - **Answer as Subheadline**: Color-accented high-yield answer badge.
  - **Unicode Bengali Explanations**: 3–5 sentence clear medical explanations rendered with clean Bengali typography (`Hind Siliguri`).
  - **Gesture Navigation**: Swipe right on your mobile screen to advance to the next question, or swipe left to go back (also supports Next/Previous buttons and keyboard arrows).
  - **Top Progress Bar**: Thin visual progress bar showing topic completion.
  - **Local Memory Cache**: Remembers your reading position per chapter so you always resume where you left off.

- **📝 Dynamic MCQ Exam Engine**:
  - **Topic Exams**: Test yourself on any single chapter.
  - **🏆 Grand Exam**: Shuffles questions and answers across the entire database.
  - **Authentic Distractor Generation**: Dynamically selects 3 plausible wrong options from the same subject pool.
  - **Fisher-Yates Shuffle**: Options (A, B, C, D) are completely randomized every time.
  - **Post-Exam Review**: Explanations remain hidden during the exam and are fully revealed upon submission with detailed score breakdown.

- **🔥 "Hard Questions" (Mistake Bank)**:
  - Questions answered incorrectly in exams are automatically added to the Hard Questions list.
  - Shows how many times you missed each question (e.g. *Missed 2 times*).
  - Dedicated "Mistake Drill" exam to practice only weak areas until mastered.

- **⭐ Flagged / Important Questions**:
  - Tap the star icon (★) anywhere in study mode or after an exam to bookmark questions.
  - Separate filter on the home screen for targeted revision.

- **🔍 Quick Search**:
  - Instant search across all questions, answers, and explanations.

- **🌓 Dark & Light Modes**:
  - High-contrast night theme for comfortable study sessions.

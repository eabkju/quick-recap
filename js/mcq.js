/**
 * MCQ Generator & Shuffler
 * Generates 4-option multiple-choice questions with authentic distractors and Fisher-Yates shuffle.
 */

export function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateMcqExam(questionPool, examSize = null, globalDistractorPool = []) {
  if (!questionPool || questionPool.length === 0) return [];

  // Shuffle questions for this exam session
  const shuffledQuestions = shuffleArray(questionPool);
  const selectedQuestions = examSize ? shuffledQuestions.slice(0, examSize) : shuffledQuestions;

  // Build a distinct pool of all available answers for distractor generation
  const candidatePool = globalDistractorPool.length > 0 ? globalDistractorPool : questionPool;
  const allUniqueAnswers = Array.from(new Set(candidatePool.map(q => q.answer.trim())));

  return selectedQuestions.map((q, idx) => {
    const correctAnswer = q.answer.trim();

    // Find plausible distractors (answers from different questions)
    // Prefer answers from the same topic if available
    const sameTopicAnswers = Array.from(new Set(
      candidatePool
        .filter(item => item.topic === q.topic && item.answer.trim() !== correctAnswer)
        .map(item => item.answer.trim())
    ));

    const otherAnswers = allUniqueAnswers.filter(ans => ans !== correctAnswer && !sameTopicAnswers.includes(ans));

    // Combine candidate distractors, prioritizing same topic
    const availableDistractors = [...shuffleArray(sameTopicAnswers), ...shuffleArray(otherAnswers)];

    // Take top 3 distractors
    const chosenDistractors = availableDistractors.slice(0, 3);

    // If still less than 3, fallback placeholders
    while (chosenDistractors.length < 3) {
      chosenDistractors.push(`None of the above option ${chosenDistractors.length + 1}`);
    }

    // Combine correct answer + distractors and shuffle
    const rawOptions = [correctAnswer, ...chosenDistractors];
    const shuffledOptions = shuffleArray(rawOptions);
    const correctIndex = shuffledOptions.indexOf(correctAnswer);

    return {
      examQuestionIndex: idx,
      id: q.id || `${q.topic}_${idx}`,
      question: q.question,
      correctAnswer: correctAnswer,
      options: shuffledOptions,
      correctIndex: correctIndex,
      explanation_bn: q.explanation_bn,
      topic: q.topic,
      chapterId: q.chapterId,
      rawItem: q
    };
  });
}

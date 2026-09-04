export function validateSolution(solution, answer) {
  const errors = solution.questions.flatMap((question) => {
    const actual = answer[question.id];
    let correct = false;
    if (question.type === "single") correct = actual === question.answer;
    if (question.type === "multiple") correct = [...(actual ?? [])].sort().join("|") === [...question.answer].sort().join("|");
    if (question.type === "order") correct = (actual ?? []).join("|") === question.answer.join("|");
    return correct ? [] : [question.error];
  });
  return { correct: errors.length === 0, errors };
}

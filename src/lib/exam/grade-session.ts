/**
 * 主观题评分界面只认「当前这一次请求」。
 * 旧请求晚到时不改界面、不把新的写作态打回结果页。
 * 当前请求若已经提交成功，即使随后点了取消，也显示已保存，不再当成没评上。
 */

export type GradeScreen<V> =
  | { kind: 'writing' }
  | { kind: 'grading' }
  | { kind: 'gradeError'; message: string }
  | { kind: 'graded'; view: V };

export type GradeRequestOutcome<V> =
  { status: 'saved'; view: V } | { status: 'aborted' } | { status: 'error'; message: string };

export function reduceGradeScreen<V>(
  screen: GradeScreen<V>,
  currentTicket: number,
  event: { ticket: number; outcome: GradeRequestOutcome<V> },
): GradeScreen<V> {
  if (event.ticket !== currentTicket) return screen;
  if (event.outcome.status === 'saved') return { kind: 'graded', view: event.outcome.view };
  if (event.outcome.status === 'aborted')
    return screen.kind === 'grading' ? { kind: 'writing' } : screen;
  return { kind: 'gradeError', message: event.outcome.message };
}

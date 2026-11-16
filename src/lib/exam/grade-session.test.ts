import { reduceGradeScreen, type GradeScreen } from './grade-session';

const saved = { status: 'saved' as const, view: { score: 8 } };
const grading: GradeScreen<{ score: number }> = { kind: 'grading' };

describe('评分界面只跟当前请求走', () => {
  it('旧的取消晚到：不把正在进行的新请求打回写作，也不停在评分中', () => {
    const screen = reduceGradeScreen(grading, 2, { ticket: 1, outcome: { status: 'aborted' } });
    expect(screen).toBe(grading);
  });

  it('旧的成功晚到：不覆盖新请求，也不清掉新的写作态', () => {
    const writing: GradeScreen<{ score: number }> = { kind: 'writing' };
    expect(reduceGradeScreen(writing, 2, { ticket: 1, outcome: saved })).toBe(writing);
    expect(reduceGradeScreen(grading, 2, { ticket: 1, outcome: saved })).toBe(grading);
  });

  it('当前请求在提交前被取消：从「正在评分」回到写作，不一直转圈', () => {
    expect(reduceGradeScreen(grading, 2, { ticket: 2, outcome: { status: 'aborted' } })).toEqual({
      kind: 'writing',
    });
  });

  it('当前请求已经保存成功：即使之后点了取消，仍显示已保存，不当成失败', () => {
    expect(reduceGradeScreen({ kind: 'writing' }, 2, { ticket: 2, outcome: saved })).toEqual({
      kind: 'graded',
      view: { score: 8 },
    });
  });

  it('当前请求评分失败：显示错误，可以重试', () => {
    expect(
      reduceGradeScreen(grading, 2, {
        ticket: 2,
        outcome: { status: 'error', message: '网络错误' },
      }),
    ).toEqual({ kind: 'gradeError', message: '网络错误' });
  });
});

/**
 * 同一把钥匙上、还没结束的调用共用一个 Promise（重复点击不会各跑一遍）。
 * 成功或失败后钥匙就释放：失败可以马上重试；下一次调用会重新执行，
 * 要不要再写库由调用方按「同一题、同一次开始时间、同一份答案」判断。
 */
const inflight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const run = fn();
  const p = run.finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

/**
 * 一次交卷的去重钥匙。只用题、开始时间、答案（主观题再加上草稿槽），
 * 不含随机的 attempt id，所以同一次作答的两次调用会撞上同一把钥匙。
 */
export function submissionFlightKey(
  parts: readonly { questionId: string; startedAt: number; answer: string; slot?: string }[],
): string {
  return parts
    .map((p) => `${p.slot ?? ''}\0${p.questionId}\0${p.startedAt}\0${p.answer}`)
    .join('\u0001');
}

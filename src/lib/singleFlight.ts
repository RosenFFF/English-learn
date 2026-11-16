/**
 * 同一把钥匙、同一次请求（同一个 AbortSignal，且还没取消）上还没结束的调用共用一个 Promise。
 * 用来挡住双击。已经取消的请求不把后来的新信号绑上去，否则新的重交会跟着旧 Promise 一起失败。
 * 成功或失败后钥匙就释放：失败可以马上重试；下一次调用会重新执行，
 * 要不要再写库由调用方按「同一题、同一次开始时间、同一份答案」判断。
 */
interface Inflight {
  signal: AbortSignal | undefined;
  promise: Promise<unknown>;
}

const inflight = new Map<string, Inflight>();

export function singleFlight<T>(
  key: string,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const hit = inflight.get(key);
  if (hit && hit.signal === signal && !signal?.aborted) return hit.promise as Promise<T>;
  const run = fn();
  const p = run.finally(() => {
    if (inflight.get(key)?.promise === p) inflight.delete(key);
  });
  inflight.set(key, { signal, promise: p });
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

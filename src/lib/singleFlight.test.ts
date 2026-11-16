import { singleFlight, submissionFlightKey } from './singleFlight';

describe('singleFlight', () => {
  it('进行中的调用共用一个结果；结束后下一次会重新执行', async () => {
    let n = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fn = (): Promise<number> => {
      n += 1;
      return gate.then(() => n);
    };
    const a = singleFlight('k', fn);
    const b = singleFlight('k', fn);
    expect(n).toBe(1);
    release();
    await expect(a).resolves.toBe(1);
    await expect(b).resolves.toBe(1);
    await expect(singleFlight('k', async () => 2)).resolves.toBe(2);
  });

  it('失败后钥匙释放，下一次会重新执行', async () => {
    let n = 0;
    await expect(
      singleFlight('e', async () => {
        n += 1;
        throw new Error('no');
      }),
    ).rejects.toThrow('no');
    await expect(
      singleFlight('e', async () => {
        n += 1;
        return 'ok';
      }),
    ).resolves.toBe('ok');
    expect(n).toBe(2);
  });
});

describe('submissionFlightKey', () => {
  it('同一份答案是同一把钥匙；开始时间、答案或草稿槽不同就分开', () => {
    const base = { questionId: 'q', startedAt: 1, answer: '["A"]' };
    expect(submissionFlightKey([base])).toBe(submissionFlightKey([{ ...base }]));
    expect(submissionFlightKey([base])).not.toBe(submissionFlightKey([{ ...base, startedAt: 2 }]));
    expect(submissionFlightKey([base])).not.toBe(
      submissionFlightKey([{ ...base, answer: '["B"]' }]),
    );
    expect(submissionFlightKey([base])).not.toBe(submissionFlightKey([{ ...base, slot: 'redo' }]));
  });
});

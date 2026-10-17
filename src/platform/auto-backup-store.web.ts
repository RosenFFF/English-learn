/**
 * 平台层（网页调试版）：自动备份放在内存里，刷新页面即清空。接口与安卓版相同。
 */
import type { AutoBackupStore } from './auto-backup-store';

export type { AutoBackupStore } from './auto-backup-store';

const files = new Map<string, string>();

export const autoBackupStore: AutoBackupStore = {
  async list() {
    return [...files.keys()];
  },
  async write(name, text) {
    files.set(name, text);
  },
  async read(name) {
    const text = files.get(name);
    if (text === undefined) throw new Error('自动备份不存在');
    return text;
  },
  async remove(name) {
    files.delete(name);
  },
};

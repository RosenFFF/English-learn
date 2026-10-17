/**
 * 平台层（安卓）：自动备份的存放位置是 app 文档目录下的 auto-backups/，卸载 app 时随之删除。
 * 只做文件读写；文件名、轮转规则在 src/lib/backup.ts，业务流程在 src/features/backup/service.ts。
 */
import { Directory, File, Paths } from 'expo-file-system';

/** 自动备份存储接口：安卓写文件，网页版放内存，单测里注入假的实现 */
export interface AutoBackupStore {
  /** 目录里的文件名（可能包含非自动备份文件，调用方自己过滤） */
  list(): Promise<string[]>;
  write(name: string, text: string): Promise<void>;
  read(name: string): Promise<string>;
  remove(name: string): Promise<void>;
}

function dir(): Directory {
  const d = new Directory(Paths.document, 'auto-backups');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export const autoBackupStore: AutoBackupStore = {
  async list() {
    return dir()
      .list()
      .filter((e): e is File => e instanceof File)
      .map((f) => f.name);
  },
  async write(name, text) {
    const f = new File(dir(), name);
    if (f.exists) f.delete();
    f.create();
    await f.write(text);
  },
  async read(name) {
    return new File(dir(), name).text();
  },
  async remove(name) {
    const f = new File(dir(), name);
    if (f.exists) f.delete();
  },
};

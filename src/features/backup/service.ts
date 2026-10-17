import { getDatabases } from '../../db/open';
import { dumpForBackup, restoreFromBackup } from '../../db/userRepo';
import {
  autoBackupFileName,
  autoBackupsToPrune,
  backupFileName,
  BackupError,
  parseBackup,
  sortAutoBackups,
  type BackupPayload,
} from '../../lib/backup';
import { notifyDataChanged } from '../shared';
import { autoBackupStore } from '../../platform/auto-backup-store';
import { pickTextFile, saveTextFile } from '../../platform/files';
import type { AutoBackupInfo, AutoBackupStore } from './types';

export type { AutoBackupInfo } from './types';

/** 可注入的依赖：单测里替换成假的存储、文件选择和时钟 */
export interface BackupDeps {
  store: AutoBackupStore;
  pickFile: () => Promise<string | null>;
  now: () => number;
}

const defaultDeps: BackupDeps = { store: autoBackupStore, pickFile: pickTextFile, now: Date.now };

/** 自动备份失败：导入/恢复已取消，当前进度没有任何改动 */
export class AutoBackupError extends Error {}

export async function exportProgress(): Promise<string> {
  const { user, schemaVersion } = await getDatabases();
  const now = Date.now();
  const payload = await dumpForBackup(user, schemaVersion, now);
  const how = await saveTextFile(backupFileName(now), JSON.stringify(payload));
  return how === 'shared'
    ? `已导出 ${payload.card.length} 个单词的进度`
    : `已保存备份文件（${payload.card.length} 个单词）`;
}

/**
 * 把当前进度存一份自动备份（格式与手动导出相同，不含 API 密钥），然后只保留最近 5 份。
 * 写入失败抛 AutoBackupError；轮转删除旧文件失败不影响本次备份。
 */
export async function createAutoBackup(deps: BackupDeps = defaultDeps): Promise<AutoBackupInfo> {
  const createdAt = deps.now();
  const name = autoBackupFileName(createdAt);
  try {
    const { user, schemaVersion } = await getDatabases();
    const payload = await dumpForBackup(user, schemaVersion, createdAt);
    await deps.store.write(name, JSON.stringify(payload));
  } catch {
    throw new AutoBackupError('自动备份当前进度失败，已取消，现有进度没有改动');
  }
  try {
    for (const old of autoBackupsToPrune(await deps.store.list())) await deps.store.remove(old);
  } catch {
    // 轮转失败只是多占一点空间，下次备份时会再删
  }
  return { name, createdAt };
}

/** 最近的自动备份，从新到旧 */
export async function listAutoBackups(deps: BackupDeps = defaultDeps): Promise<AutoBackupInfo[]> {
  try {
    return sortAutoBackups(await deps.store.list());
  } catch {
    return [];
  }
}

async function applyPayload(payload: BackupPayload): Promise<void> {
  const { user } = await getDatabases();
  await restoreFromBackup(user, payload);
  notifyDataChanged();
}

/** 已选好文件、已校验，等用户在确认框里点「导入」。此时还没有写任何东西。 */
export interface PreparedImport {
  cards: number;
  exportedAt: number;
  /** 先自动备份当前进度，再覆盖。备份失败抛 AutoBackupError，不会导入。 */
  apply: () => Promise<string>;
}

/**
 * 导入第一步：选文件 → 校验，只读不写。返回 null 表示用户取消了选择。
 * 文件无效抛 BackupError。用户确认后调 apply()：先自动备份当前进度，再覆盖；
 * 这样在确认框里取消不会产生备份，也不会挤掉 5 份名额里有用的那份。
 */
export async function prepareImport(
  deps: BackupDeps = defaultDeps,
): Promise<PreparedImport | null> {
  const text = await deps.pickFile();
  if (text == null) return null;
  const payload = parseBackup(text);
  return {
    cards: payload.card.length,
    exportedAt: payload.exported_at,
    apply: async () => {
      await createAutoBackup(deps);
      try {
        await applyPayload(payload);
      } catch {
        throw new Error('导入失败，现有进度没有改动');
      }
      return `已导入 ${payload.card.length} 个单词的进度`;
    },
  };
}

/** 从自动备份恢复：已读出并校验目标备份，等用户确认。此时还没有写任何东西。 */
export interface PreparedRestore {
  target: AutoBackupInfo;
  cards: number;
  /** 先把当前进度自动备份一份，再覆盖。备份失败抛 AutoBackupError，不会恢复。 */
  apply: () => Promise<string>;
}

/**
 * 从最近一份自动备份恢复。返回 null 表示还没有自动备份。
 * 恢复同样会覆盖当前进度，所以 apply() 里先把当前进度也自动备份一份（之后再点一次就能撤销）。
 * 只在用户确认后才备份，取消不会改动备份列表。
 */
export async function prepareRestoreLatest(
  deps: BackupDeps = defaultDeps,
): Promise<PreparedRestore | null> {
  const [target] = await listAutoBackups(deps);
  if (!target) return null;
  let payload: BackupPayload;
  try {
    payload = parseBackup(await deps.store.read(target.name));
  } catch (e) {
    throw e instanceof BackupError ? e : new BackupError('自动备份文件读不出来');
  }
  return {
    target,
    cards: payload.card.length,
    apply: async () => {
      await createAutoBackup(deps);
      try {
        await applyPayload(payload);
      } catch {
        throw new Error('恢复失败，现有进度没有改动');
      }
      return `已从自动备份恢复 ${payload.card.length} 个单词的进度`;
    },
  };
}

/** 给界面显示的备份时间，例如「10月17日 15:30」 */
export function formatBackupTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

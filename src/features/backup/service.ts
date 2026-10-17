import { getDatabases } from '../../db/open';
import { dumpForBackup, restoreFromBackup } from '../../db/userRepo';
import { backupFileName, BackupError, parseBackup } from '../../lib/backup';
import { notifyDataChanged } from '../shared';
import { pickTextFile, saveTextFile } from '../../platform/files';

export async function exportProgress(): Promise<string> {
  const { user, schemaVersion } = await getDatabases();
  const now = Date.now();
  const payload = await dumpForBackup(user, schemaVersion, now);
  const how = await saveTextFile(backupFileName(now), JSON.stringify(payload));
  return how === 'shared'
    ? `已导出 ${payload.card.length} 个单词的进度`
    : `已保存备份文件（${payload.card.length} 个单词）`;
}

/** 返回 null 表示用户取消了选择 */
export async function importProgress(): Promise<string | null> {
  const text = await pickTextFile();
  if (text == null) return null;
  try {
    const payload = parseBackup(text);
    const { user } = await getDatabases();
    await restoreFromBackup(user, payload);
    notifyDataChanged();
    return `已导入 ${payload.card.length} 个单词的进度`;
  } catch (e) {
    throw e instanceof BackupError ? e : new Error('导入失败，现有进度没有改动');
  }
}

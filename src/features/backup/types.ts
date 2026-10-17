/** 自动备份：存储接口在平台层（安卓写 app 文档目录，网页版放内存），单测里用假的实现注入。 */
export type { AutoBackupStore } from '../../platform/auto-backup-store';

export interface AutoBackupInfo {
  name: string;
  createdAt: number;
}

/** 平台层（安卓）：导出写到缓存目录后用系统分享面板保存；导入用系统文件选择器。 */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function saveTextFile(name: string, text: string): Promise<'shared' | 'saved'> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: '保存学习进度备份',
    });
    return 'shared';
  }
  return 'saved';
}

export async function pickTextFile(): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (r.canceled || !r.assets[0]) return null;
  return new File(r.assets[0].uri).text();
}

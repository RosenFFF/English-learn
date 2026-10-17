/** 网页版：导出直接下载文件；导入用浏览器文件选择。 */
import * as DocumentPicker from 'expo-document-picker';

export async function saveTextFile(name: string, text: string): Promise<'shared' | 'saved'> {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}

export async function pickTextFile(): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'] });
  if (r.canceled || !r.assets[0]) return null;
  const f = r.assets[0].file;
  return f ? f.text() : (await fetch(r.assets[0].uri)).text();
}

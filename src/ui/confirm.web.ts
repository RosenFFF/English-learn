// react-native-web 的 Alert 是空实现，网页版用浏览器原生对话框
export function confirmAsync(title: string, message: string): Promise<boolean> {
  return Promise.resolve(window.confirm(`${title}\n\n${message}`));
}

export function toast(title: string, message?: string): void {
  window.alert(message ? `${title}\n\n${message}` : title);
}

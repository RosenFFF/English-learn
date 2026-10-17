import { Alert } from 'react-native';

export function confirmAsync(title: string, message: string, okText = '确定'): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel', onPress: () => resolve(false) },
      { text: okText, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function toast(title: string, message?: string): void {
  Alert.alert(title, message);
}

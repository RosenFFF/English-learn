import { Tabs } from 'expo-router';

import { booksPlaceholder } from '@/features/books';
import { settingsPlaceholder } from '@/features/settings';
import { practicePlaceholder, todayPlaceholder } from '@/features/study';

export const unstable_settings = {
  initialRouteName: 'today',
};

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="today" options={{ title: todayPlaceholder.title }} />
      <Tabs.Screen name="books" options={{ title: booksPlaceholder.title }} />
      <Tabs.Screen name="practice" options={{ title: practicePlaceholder.title }} />
      <Tabs.Screen name="me" options={{ title: settingsPlaceholder.title }} />
    </Tabs>
  );
}

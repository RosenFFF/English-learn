import { PlaceholderScreen } from '@/components/placeholder-screen';

export const todayPlaceholder = {
  title: '今天',
  body: '今日待学、复习和连续打卡将在后续版本接入。',
} as const;

export const practicePlaceholder = {
  title: '练习',
  body: '练习题将在后续版本接入。',
} as const;

export function TodayScreen() {
  return <PlaceholderScreen title={todayPlaceholder.title} body={todayPlaceholder.body} />;
}

export function PracticeScreen() {
  return <PlaceholderScreen title={practicePlaceholder.title} body={practicePlaceholder.body} />;
}

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { todayPlaceholder } from '@/features/study';

export default function TodayScreen() {
  return <PlaceholderScreen title={todayPlaceholder.title} body={todayPlaceholder.body} />;
}

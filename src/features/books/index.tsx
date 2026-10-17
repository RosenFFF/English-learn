import { PlaceholderScreen } from '@/components/placeholder-screen';

export const booksPlaceholder = {
  title: '词书',
  body: '词书里的单词列表将在后续版本接入。',
} as const;

export function BooksScreen() {
  return <PlaceholderScreen title={booksPlaceholder.title} body={booksPlaceholder.body} />;
}

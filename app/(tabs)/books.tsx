import { PlaceholderScreen } from '@/components/placeholder-screen';
import { booksPlaceholder } from '@/features/books';

export default function BooksScreen() {
  return <PlaceholderScreen title={booksPlaceholder.title} body={booksPlaceholder.body} />;
}

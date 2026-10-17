import { booksPlaceholder } from '@/features/books';
import { settingsPlaceholder } from '@/features/settings';
import { practicePlaceholder, todayPlaceholder } from '@/features/study';
import { renderRouter, screen } from 'expo-router/testing-library';

const tabLabels = [
  todayPlaceholder.title,
  booksPlaceholder.title,
  practicePlaceholder.title,
  settingsPlaceholder.title,
];

describe('tabs', () => {
  it('renders the four tabs', async () => {
    await renderRouter('./src/app', { initialUrl: '/today' });

    for (const label of tabLabels) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });
});

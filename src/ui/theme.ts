import { useColorScheme } from 'react-native';

import type { BookExam } from '../features/books/constants';

export interface Palette {
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  primaryText: string;
  primarySoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warningSoft: string;
  warningText: string;
  rating: Record<'again' | 'hard' | 'good' | 'easy', string>;
  exam: Record<BookExam, string>;
}

const light: Palette = {
  scheme: 'light',
  bg: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F3',
  border: '#E3E6EA',
  text: '#11161D',
  textSecondary: '#545E6B',
  textTertiary: '#7A8491',
  primary: '#2F6BED',
  primaryText: '#FFFFFF',
  primarySoft: '#E7EEFD',
  danger: '#D93D42',
  dangerSoft: '#FCE9E9',
  success: '#138A4B',
  successSoft: '#E2F4EA',
  warningSoft: '#FFF4DE',
  warningText: '#8A5A00',
  rating: { again: '#D93D42', hard: '#C77700', good: '#138A4B', easy: '#2F6BED' },
  exam: { cet4: '#2F6BED', cet6: '#5146E0', kaoyan: '#138A4B', ielts: '#8243D9' },
};

const dark: Palette = {
  scheme: 'dark',
  bg: '#0D1015',
  surface: '#161A21',
  surfaceAlt: '#1F242D',
  border: '#272D37',
  text: '#ECEFF3',
  textSecondary: '#A5AEBA',
  textTertiary: '#7F8996',
  primary: '#5B8DFF',
  primaryText: '#0B1220',
  primarySoft: '#1B2740',
  danger: '#FF6B6F',
  dangerSoft: '#3A1D1F',
  success: '#3CCB7F',
  successSoft: '#14301F',
  warningSoft: '#2E2513',
  warningText: '#F5C46B',
  rating: { again: '#FF6B6F', hard: '#F2A93B', good: '#3CCB7F', easy: '#5B8DFF' },
  exam: { cet4: '#5B8DFF', cet6: '#8A80FF', kaoyan: '#3CCB7F', ielts: '#B783FF' },
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
export const MAX_WIDTH = 560;

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const SQL_PATTERN = /\b(CREATE\s+TABLE|INSERT\s+INTO|execAsync|runAsync)\b/;

function listTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (
      entry === 'node_modules' ||
      entry === 'dist' ||
      entry === 'coverage' ||
      entry === 'android' ||
      entry === 'ios' ||
      entry === '.git' ||
      entry === '.expo'
    ) {
      continue;
    }
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listTypeScriptFiles(fullPath));
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx')
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('sql boundary', () => {
  it('keeps SQL out of every TypeScript file outside src/db', () => {
    const root = process.cwd();
    const dbRoot = path.join(root, 'src/db');
    const offenders = listTypeScriptFiles(root).filter((file) => {
      if (file.startsWith(dbRoot + path.sep) || file === dbRoot) {
        return false;
      }
      return SQL_PATTERN.test(readFileSync(file, 'utf8'));
    });
    expect(offenders).toEqual([]);
  });
});

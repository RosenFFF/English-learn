/** 单测用：Node 自带的 fs/os/path 的最小类型封装（项目不引入 @types/node） */
interface NodeFs {
  copyFileSync(src: string, dest: string): void;
  mkdtempSync(prefix: string): string;
  readdirSync(dir: string): string[];
  rmSync(path: string, opts?: { recursive?: boolean; force?: boolean }): void;
  statSync(path: string): { ino: number; size: number };
}

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs') as NodeFs;
const os = require('node:os') as { tmpdir(): string };
const path = require('node:path') as { join(...parts: string[]): string };
/* eslint-enable @typescript-eslint/no-require-imports */

export const { copyFileSync, mkdtempSync, readdirSync, rmSync, statSync } = fs;
export const tmpdir = (): string => os.tmpdir();
export const join = (...parts: string[]): string => path.join(...parts);

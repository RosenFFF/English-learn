import { readFileSync } from 'fs';
import path from 'path';

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const EXACT_VERSION = /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/;

describe('dependency versions', () => {
  it('pins direct dependencies to exact versions', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
    ) as PackageJson;
    const sections = [packageJson.dependencies, packageJson.devDependencies];

    for (const section of sections) {
      for (const [name, version] of Object.entries(section ?? {})) {
        expect({ name, version }).toEqual({ name, version: expect.stringMatching(EXACT_VERSION) });
      }
    }
  });
});

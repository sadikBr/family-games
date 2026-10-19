/** The Windows build script must stay plain ASCII: Windows PowerShell 5.1 reads a .ps1 without a BOM in
 * the ANSI code page, and a character like an em dash then breaks its strings ("missing the terminator"). */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('scripts/build-apk-windows.ps1 and .cmd are plain ASCII', () => {
  for (const f of ['build-apk-windows.ps1', 'build-apk-windows.cmd', 'publish-update-windows.ps1', 'publish-update-windows.cmd']) {
    const text = readFileSync(join(import.meta.dir, '..', 'scripts', f), 'utf8');
    const bad = [...text].filter((c) => c.charCodeAt(0) > 127);
    expect({ f, bad }).toEqual({ f, bad: [] });
  }
});

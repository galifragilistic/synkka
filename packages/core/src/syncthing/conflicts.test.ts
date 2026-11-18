import { describe, expect, it } from 'vitest';
import { isConflictName, normalizeDeviceId, parseConflictName, versionsPath, withVersionTag } from './conflicts';
import { folderListId, parseFolderListId } from './service';

describe('syncthing conflict names', () => {
  it('parses the original path, time and device', () => {
    const p = parseConflictName('docs/Budjetti.sync-conflict-20261117-130500-ABCDEF2.xlsx')!;
    expect(p.original).toBe('docs/Budjetti.xlsx');
    expect(p.shortDeviceId).toBe('ABCDEF2');
    expect(p.at.getHours()).toBe(13);
    expect(parseConflictName('README.sync-conflict-20261117-130500-ABCDEF2')!.original).toBe('README');
    expect(parseConflictName('Budjetti.xlsx')).toBeNull();
    expect(isConflictName('a/b.sync-conflict-20261117-130500-ABCDEF2.txt')).toBe(true);
  });

  it('normalizes device IDs', () => {
    const id = 'Y4T6HY4-YKZMKGX-PDDBN5J-ODUSGIH-VAMDZE3-HF5RDOK-RTBXSPR-DGOEGA7';
    expect(normalizeDeviceId(id.toLowerCase().replace(/-/g, ' '))).toBe(id);
    expect(normalizeDeviceId('nope')).toBeNull();
  });

  it('builds list ids and versions paths', () => {
    expect(parseFolderListId(folderListId('abc', 'x/y'))).toEqual({ folder: 'abc', path: 'x/y' });
    expect(parseFolderListId('root')).toBeNull();
    expect(versionsPath('x/y.txt')).toBe('.stversions/x/y.txt');
    expect(parseConflictName('a/app.sync-conflict-20260806-160925-46FUGHS.json')!.tag).toBe('20260806-160925');
    expect(withVersionTag('.obsidian/app.json', '20260806-160925')).toBe('.obsidian/app~20260806-160925.json');
    expect(withVersionTag('dir/README', '20260806-160925')).toBe('dir/README~20260806-160925');
    expect(withVersionTag('.bashrc', 't')).toBe('.bashrc~t');
  });
});

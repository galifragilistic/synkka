import { describe, expect, it } from 'vitest';
import { describeSyncError } from './errors';

describe('describeSyncError', () => {
  it('explains names Android cannot store (real error from the phone)', () => {
    const raw = 'syncing: finishing: opening temp file: open /storage/emulated/0/Synkka/Obsidian Vault/Polkupyörä/.syncthing.Whistle Cobalt 29".md.tmp: operation not permitted';
    expect(describeSyncError('Polkupyörä/Whistle Cobalt 29".md', raw)).toBe(
      'Tiedostonimessä on merkki, jota tämä laite ei salli ("). Nimeä tiedosto uudelleen laitteella, jolla se on.',
    );
  });

  it('maps other common errors', () => {
    expect(describeSyncError('a.md', 'syncing: no connected device has the required version of this file')).toMatch(/Yksikään/);
    expect(describeSyncError('a.md', 'open a.md: permission denied')).toMatch(/lupaa/);
    expect(describeSyncError('a.md', 'syncing: weird')).toBe('Synkronointi epäonnistui: weird');
  });
});

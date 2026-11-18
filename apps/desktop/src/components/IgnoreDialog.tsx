import { useEffect, useRef, useState } from 'react';
import { t, type FileItem, type IgnoreRules } from '@synkka/core';
import { useSync } from '../hooks';
import { Button, IconButton } from './primitives';

const GENERIC = ['// Käyttöjärjestelmien roskatiedostot', '(?d).DS_Store', '(?d)Thumbs.db', '(?d)desktop.ini'];
const OBSIDIAN = [
  '// Obsidianin ikkunoiden ja välilehtien asettelu: laitekohtaista, aiheuttaa ristiriitoja',
  '.obsidian/workspace*.json',
  '// Obsidianin oma roskakori',
  '.trash',
];

const toText = (lines: string[]) => lines.join('\n');
const toLines = (text: string) => text.split('\n');

/** Ignore rules of one folder (not designed yet: uses the dialog/field patterns of pairing). */
export function IgnoreDialog({
  folderId, folderLabel, listId, onClose, onSaved, onError,
}: {
  folderId: string;
  folderLabel: string;
  listId: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const sync = useSync();
  const ref = useRef<HTMLDialogElement>(null);
  const [rules, setRules] = useState<{ shared: string; local: string } | null>(null);
  const [isObsidian, setIsObsidian] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sync.getIgnores(folderId).then(
      (r: IgnoreRules) => setRules({ shared: toText(r.shared), local: toText(r.local) }),
      (e) => {
        onError(String(e?.message ?? e));
        onClose();
      },
    );
    // Offer Obsidian presets when the folder is an Obsidian vault.
    const unsub = sync.list(listId).subscribe((items: FileItem[]) => setIsObsidian(items.some((i) => i.name === '.obsidian')));
    return unsub;
  }, [sync, folderId, listId, onClose, onError]);

  useEffect(() => {
    if (rules && ref.current && !ref.current.open) ref.current.showModal();
  }, [rules]);

  if (!rules) return null;

  /** Adds preset rules that are missing; a "//" comment goes in only with the rules it describes. */
  const addPreset = (preset: string[]) => {
    const existing = new Set(toLines(rules.shared).map((l) => l.trim()));
    const add: string[] = [];
    let comment: string | null = null;
    for (const line of preset) {
      if (line.startsWith('//')) {
        comment = line;
      } else if (!existing.has(line)) {
        if (comment && !existing.has(comment) && !add.includes(comment)) add.push(comment);
        add.push(line);
      }
    }
    if (add.length) setRules({ ...rules, shared: [rules.shared.trimEnd(), ...add].filter(Boolean).join('\n') });
  };

  const save = async () => {
    setBusy(true);
    try {
      await sync.setIgnores(folderId, { shared: toLines(rules.shared), local: toLines(rules.local) });
      ref.current?.close();
      onSaved();
    } catch (e) {
      onError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="dialog dialog--wide" aria-labelledby="ignore-title" onClose={onClose}>
      <div className="dialog__body">
        <div className="dialog__head">
          <h2 id="ignore-title">
            {t('ignore.title')} <span className="muted">· {folderLabel}</span>
          </h2>
          <IconButton icon="close" label={t('common.close')} onClick={() => ref.current?.close()} />
        </div>

        <p className="muted small note">{t('ignore.syntax')}</p>

        <label className="field">
          <span className="field__label">{t('ignore.shared')}</span>
          <span className="muted label">{t('ignore.sharedHint')}</span>
          <textarea
            className="field__input field__textarea mono"
            rows={8}
            spellCheck={false}
            value={rules.shared}
            onChange={(e) => setRules({ ...rules, shared: e.target.value })}
          />
        </label>
        <div className="pending__actions">
          {isObsidian && (
            <Button size="sm" icon="plus" onClick={() => addPreset(OBSIDIAN)}>
              {t('ignore.suggest')}
            </Button>
          )}
          <Button size="sm" icon="plus" onClick={() => addPreset(GENERIC)}>
            {t('ignore.suggestGeneric')}
          </Button>
        </div>

        <label className="field">
          <span className="field__label">{t('ignore.local')}</span>
          <span className="muted label">{t('ignore.localHint')}</span>
          <textarea
            className="field__input field__textarea mono"
            rows={4}
            spellCheck={false}
            value={rules.local}
            onChange={(e) => setRules({ ...rules, local: e.target.value })}
          />
        </label>

        <div className="dialog__footer">
          <Button onClick={() => ref.current?.close()}>{t('common.close')}</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {t('ignore.save')}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

import fi from './locales/fi.json';

export type Params = Record<string, string | number>;
type Plural = { one: string; other: string };
type Messages = { [key: string]: string | Plural | Messages };

const locales: Record<string, Messages> = { fi: fi as unknown as Messages };

/** Register another locale (e.g. English) without touching components. */
export function registerLocale(code: string, messages: Messages): void {
  locales[code] = messages;
}

export type Translate = (key: string, params?: Params) => string;

function isPlural(v: unknown): v is Plural {
  return typeof v === 'object' && v !== null && 'one' in v && 'other' in v;
}

function lookup(messages: Messages, key: string): string | Plural | undefined {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string' || isPlural(node)) return node;
  return undefined;
}

export function interpolate(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function createTranslator(locale = 'fi', fallback = 'fi'): Translate {
  return (key, params) => {
    const raw = lookup(locales[locale] ?? {}, key) ?? lookup(locales[fallback] ?? {}, key);
    if (raw === undefined) return key;
    const template = isPlural(raw) ? (Number(params?.count) === 1 ? raw.one : raw.other) : raw;
    return interpolate(template, params);
  };
}

export const t: Translate = createTranslator('fi');

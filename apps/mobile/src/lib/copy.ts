import { t, type Params } from '@synkka/core';

/**
 * Mobile-only copy not (yet) in core/locales/fi.json. Uses the core key once it exists.
 * TODO: move these keys into packages/core/src/locales/fi.json.
 */
const MISSING: Record<string, string> = {
  'permissions.title': 'Salli pääsy tiedostoihin',
  'permissions.body':
    'Synkka synkronoi kansioita puhelimen tallennustilaan, esimerkiksi kansioon Synkka. Siksi se tarvitsee luvan hallita tiedostoja. Synkka käsittelee vain kansioita, jotka synkronoidaan.',
  'permissions.steps': 'Avautuvassa näkymässä kytke päälle "Salli kaikkien tiedostojen hallinta" ja palaa takaisin.',
  'permissions.grant': 'Avaa asetukset',
  'permissions.skip': 'Ei nyt',
  'pairing.myDevices': 'Omat laitteet',
  'folders.addHint': 'Kansio luodaan, jos sitä ei ole. Se jaetaan kaikille pariutetuille laitteille.',
};

export function tc(key: string, params?: Params): string {
  const v = t(key, params);
  if (v !== key || !(key in MISSING)) return v;
  return MISSING[key].replace(/\{(\w+)\}/g, (m, n: string) => (params && n in params ? String(params[n]) : m));
}

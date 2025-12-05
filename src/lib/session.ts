const STORAGE_VERSION = 'v2';
const STORAGE_KEY = `ignite-session-slug:${STORAGE_VERSION}`;
const LEGACY_KEYS = [
  'ignite-session-slug',
  'ignite-plan',
  'mockup-cache',
  'mockup-history',
  'architect-plan',
];

const generateSlug = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const purgeLegacyStorage = () => {
  if (typeof window === 'undefined') return;
  LEGACY_KEYS.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      console.warn(`Failed to purge legacy key: ${key}`, err);
    }
  });
};

export const readSessionSlug = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
};

export const writeSessionSlug = (value: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, value);
};

export const ensureSessionSlug = () => {
  purgeLegacyStorage();
  const existing = readSessionSlug();
  if (existing) return existing;
  const slug = generateSlug();
  writeSessionSlug(slug);
  return slug;
};

export const rotateSessionSlug = () => {
  const slug = generateSlug();
  writeSessionSlug(slug);
  return slug;
};



import brandJson from "./brand.generated.json";

export type BrandConfig = {
  id: string;
  displayNameZh: string;
  displayNameEn: string;
  productName: string;
  windowTitle: string;
  overlayTitle: string;
  logoPath: string;
  i18nReplace: {
    zh: Record<string, string>;
    en: Record<string, string>;
  };
  githubRepo: string;
  bundleIdentifier: string;
};

export const brand = {
  ...brandJson,
  heroPath: "/app-icon.png",
} as BrandConfig & { heroPath: string };

export function getBrandDisplayName(lang: string): string {
  return lang.startsWith("en") ? brand.displayNameEn : brand.displayNameZh;
}

/** Recursively apply brand string replacements to i18n resource trees. */
export function applyBrandStrings<T>(value: T, lang: "zh" | "en"): T {
  const replace = brand.i18nReplace[lang] ?? {};
  const keys = Object.keys(replace);
  if (keys.length === 0) return value;

  const mapString = (s: string): string => {
    let out = s;
    for (const from of keys) {
      out = out.split(from).join(replace[from]);
    }
    return out;
  };

  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return mapString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, walk(val)]));
    }
    return v;
  };

  return walk(value) as T;
}

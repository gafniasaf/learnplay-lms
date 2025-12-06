function slugify(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function sanitizePath(pathname: string): string {
  const slug = slugify(pathname);
  return slug || "root";
}

function deriveSemanticId(el: HTMLElement, base: string, idx: number): string {
  const target =
    (el.getAttribute("data-target") || el.getAttribute("href") || "").trim();
  const text = (el.textContent || "").trim();
  const targetSlug = slugify(target);
  const textSlug = slugify(text);
  const actionSlug = slugify(el.getAttribute("data-action") || "");

  const parts = [base];
  if (targetSlug) parts.push(targetSlug);
  else if (textSlug) parts.push(textSlug);
  else if (actionSlug) parts.push(actionSlug);
  else parts.push("action");

  parts.push(String(idx));
  return `cta-${parts.join("-")}`;
}

function tagElements(root: Document | HTMLElement, pathname: string) {
  const base = sanitizePath(pathname);
  const elements = root.querySelectorAll<HTMLElement>('a, button, [role="button"]');
  let idx = 0;
  elements.forEach((el) => {
    if (el.hasAttribute("data-cta-id")) return;
    const id = deriveSemanticId(el, base, idx++);
    el.setAttribute("data-cta-id", id);
  });
}

export function assignAutoCTAs() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const apply = () => tagElements(document, window.location.pathname);
  apply();

  // Observe future DOM changes to keep CTAs tagged in dynamic renders
  const observer = new MutationObserver(() => apply());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}


import { useDawnDataOptional } from "@/contexts/DawnDataContext";

const SHOW_MODE_BANNER = import.meta.env.VITE_SHOW_MODE_BANNER === "true";

export function DawnDataBanner() {
  const data = useDawnDataOptional();
  if (!data) return null;

  if (!SHOW_MODE_BANNER) return null;
  if (!data.authRequired) return null;

  const msg = "Workspace data is unavailable: please sign in and ensure your account has an organization configured.";

  return (
    <div data-testid="dawn-data-banner" className="w-full bg-red-50 text-red-800 text-sm px-3 py-2 text-center">
      <strong>AUTH REQUIRED</strong>
      <span className="ml-2 opacity-80">{msg}</span>
    </div>
  );
}



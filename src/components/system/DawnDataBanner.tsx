import { useDawnData } from "@/contexts/DawnDataContext";
import { isGuestMode } from "@/lib/api/common";

export function DawnDataBanner() {
  // If provider isn't present, do nothing
  let data;
  try {
    data = useDawnData();
  } catch {
    return null;
  }

  if (!data.authRequired) return null;

  const guest = isGuestMode();
  const msg = guest
    ? "Workspace data is disabled in Guest Mode (auth required)."
    : "Workspace data is unavailable: please sign in to load entity records.";

  return (
    <div data-testid="dawn-data-banner" className="w-full bg-red-50 text-red-800 text-sm px-3 py-2 text-center">
      <strong>AUTH REQUIRED</strong>
      <span className="ml-2 opacity-80">{msg}</span>
    </div>
  );
}



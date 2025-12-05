import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, Sparkles, AppWindow, Download, LogOut, LogIn } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const releaseUrl = import.meta.env.VITE_RELEASE_ZIP_URL;

type BuilderLink = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
};

const builderLinks: BuilderLink[] = [
  {
    id: "architect",
    label: "Architect Console",
    description: "Design and refine your Ignite Zero system.",
    href: "/architect",
    icon: Sparkles,
  },
  {
    id: "my-app",
    label: "My New App",
    description: "Blank canvas for the generated application.",
    href: "/my-app",
    icon: AppWindow,
  },
  releaseUrl
    ? {
        id: "download",
        label: "Download Starter ZIP",
        description: "Grab the latest Ignite Zero package.",
        href: releaseUrl,
        icon: Download,
        external: releaseUrl.startsWith("http"),
      }
    : {
        id: "setup",
        label: "Download Starter ZIP",
        description: "Head to the secure download flow.",
        href: "/setup",
        icon: Download,
      },
].filter(Boolean) as BuilderLink[];

export const BuilderMenu = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleNavigate = (link: BuilderLink) => {
    if (link.external) {
      window.open(link.href, "_blank", "noopener,noreferrer");
      setOpen(false);
      return;
    }
    navigate(link.href);
    setOpen(false);
  };

  const handleAuthNavigate = () => {
    navigate("/auth");
    setOpen(false);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Signed out");
      navigate("/auth");
    } catch (err: any) {
      toast.error(err?.message || "Failed to sign out");
    } finally {
      setOpen(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full border-slate-200/30 bg-slate-900/80 text-white shadow-lg hover:bg-slate-800"
          aria-label="Open Ignite navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:w-[360px] bg-slate-950 text-slate-100 border-l border-slate-800"
      >
        <SheetHeader>
          <SheetTitle className="text-left text-base font-semibold text-slate-100">
            Ignite Zero Navigation
          </SheetTitle>
          <SheetDescription className="text-left text-sm text-slate-400">
            Jump between the Architect Console and your in-progress app.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-8 space-y-3">
          {builderLinks.map((link) => {
            const Icon = link.icon;
            const active = !link.external && location.pathname === link.href;

            return (
              <button
                key={link.id}
                onClick={() => handleNavigate(link)}
                className={cn(
                  "w-full text-left rounded-2xl border px-4 py-4 transition-all duration-200",
                  active
                    ? "border-emerald-500/70 bg-emerald-500/10 shadow-lg shadow-emerald-500/20"
                    : "border-slate-800 bg-slate-900 hover:border-emerald-500/50 hover:bg-slate-900/70"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "rounded-full p-2",
                    active ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-300"
                  )}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{link.label}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      {link.description}
                      {link.external && <span className="text-[10px] text-slate-500">↗</span>}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
          This menu is always available in the top-right corner across builder
          pages so you can hop between the Architect and your app canvas.
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          {user ? (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wider text-slate-500">
                Signed in as
              </div>
              <div className="text-slate-200 text-sm font-semibold break-all">
                {user.email}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-red-500/40 text-red-300 hover:bg-red-500/10 flex items-center justify-center gap-2"
                onClick={handleLogout}
              >
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wider text-slate-500">
                Not signed in
              </div>
              <p className="text-sm text-slate-300">
                Sign in to sync sessions, save mockups, and resume previous plans.
              </p>
              <Button
                size="sm"
                className="w-full bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center gap-2"
                onClick={handleAuthNavigate}
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign in
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};



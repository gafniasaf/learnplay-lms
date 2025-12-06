import { Link, useNavigate, NavLink } from "react-router-dom";
import { Sparkles, LogOut, ChevronDown } from "lucide-react";
import { isLiveMode, isDevEnabled } from "@/lib/env";
import { isCourseFullscreen } from "@/lib/embed";
import { HamburgerMenu } from "./HamburgerMenu";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { getRole } from "@/lib/roles";
import { filterNav } from "@/config/nav";
import { getIcon } from "@/lib/getIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const Header = () => {
  const isLive = isLiveMode();
  const devEnabled = isDevEnabled();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentRole = getRole();
  
  // Hide header in course fullscreen mode (after all hooks)
  if (isCourseFullscreen()) return null;
  
  // Filter nav based on current role and dev settings
  const sections = filterNav({ role: currentRole, devEnabled });

  const handleToggleMode = () => {
    // Toggle the mode in localStorage
    localStorage.setItem('useMock', isLive ? 'true' : 'false');
    // Reload the page to apply changes
    window.location.reload();
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
      navigate("/auth");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleLogin = () => {
    navigate("/auth");
  };

  const isAnonymous = user?.is_anonymous;
  const userEmail = user?.email;

  // Get main sections for desktop nav
  const mainSection = sections.find(s => s.title === "Main");
  const messagesSection = sections.find(s => s.title === "Messages");
  const docsSection = sections.find(s => s.title === "Docs");
  const adminSection = sections.find(s => s.title === "Admin");
  const teacherSection = sections.find(s => s.title === "Teacher");
  const parentSection = sections.find(s => s.title === "Parent");
  const studentSection = sections.find(s => s.title === "Student");
  const devSection = sections.find(s => s.title === "Dev");

  // Combine role sections for dropdown
  const roleSections = [adminSection, teacherSection, parentSection, studentSection].filter(Boolean);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between gap-4">
        {/* Left: Logo/Brand */}
        <Link 
          to="/" 
          className="flex items-center gap-2 font-bold text-xl text-primary hover:opacity-80 transition-opacity"
        >
          <Sparkles className="h-6 w-6" />
          <span className="hidden sm:inline">LearnPlay</span>
        </Link>
        
        {/* Right: Mode indicators + Hamburger */}
        <div className="flex items-center gap-2">
          {/* DEV badge - subtle but visible */}
          {devEnabled && (
            <Link
              to="/dev/tests"
              className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-200 border-2 bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50"
              aria-label="Developer mode enabled. Click to access dev tools."
              title="Developer mode enabled"
            >
              DEV
            </Link>
          )}
          
          {/* LIVE/MOCK toggle */}
          <button
            onClick={handleToggleMode}
            title="Click to toggle between live and mock mode (persists in localStorage)"
            className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer border-2 ${
              isLive
                ? 'bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/20 hover:border-green-500/50'
                : 'bg-muted text-muted-foreground border-border hover:bg-muted/80 hover:border-border/80'
            }`}
            aria-label={`Current mode: ${isLive ? 'Live' : 'Mock'}. Click to toggle.`}
          >
            {isLive ? 'LIVE' : 'MOCK'}
          </button>
          
          <HamburgerMenu />
        </div>
      </div>
    </header>
  );
};

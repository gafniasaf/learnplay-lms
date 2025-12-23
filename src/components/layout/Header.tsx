import { Link, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { isDevEnabled } from "@/lib/env";
import { isCourseFullscreen } from "@/lib/embed";
import { HamburgerMenu } from "./HamburgerMenu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { getRole } from "@/lib/roles";
import { filterNav } from "@/config/nav";

export const Header = () => {
  const devEnabled = isDevEnabled();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentRole = getRole();
  
  // Hide header in course fullscreen mode (after all hooks)
  if (isCourseFullscreen()) return null;
  
  // Filter nav based on current role and dev settings
  const sections = filterNav({ role: currentRole, devEnabled });

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
      navigate("/auth");
    } catch (_error) {
      console.error("Logout error:", _error);
    }
  };

  const _handleLogout = handleLogout;
  void _handleLogout; // Mark as intentionally unused for now

  const _handleLogin = () => {
    navigate("/auth");
  };

  const _isAnonymous = user?.is_anonymous;
  const _userEmail = user?.email;

  // Get main sections for desktop nav
  const _mainSection = sections.find(s => s.title === "Main");
  const _messagesSection = sections.find(s => s.title === "Messages");
  const _docsSection = sections.find(s => s.title === "Docs");
  const adminSection = sections.find(s => s.title === "Admin");
  const teacherSection = sections.find(s => s.title === "Teacher");
  const parentSection = sections.find(s => s.title === "Parent");
  const studentSection = sections.find(s => s.title === "Student");
  const _devSection = sections.find(s => s.title === "Dev");

  // Combine role sections for dropdown
  const _roleSections = [adminSection, teacherSection, parentSection, studentSection].filter(Boolean);

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
        
        {/* Right: Hamburger */}
        <div className="flex items-center gap-2">
          <HamburgerMenu />
        </div>
      </div>
    </header>
  );
};

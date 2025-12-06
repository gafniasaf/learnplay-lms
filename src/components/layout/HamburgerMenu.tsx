import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, User } from "lucide-react";
import { getIcon } from "@/lib/getIcon";
import { isCourseFullscreen } from "@/lib/embed";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { filterNav, type NavItem } from "@/config/nav";
import { isDevEnabled, isLiveMode, setDevEnabled, onDevChange } from "@/lib/env";
import { useAuth } from "@/hooks/useAuth";
import { getRole, setRole, onRoleChange, type Role } from "@/lib/roles";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export const HamburgerMenu = () => {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [roleAnnouncement, setRoleAnnouncement] = useState("");
  const [modeAnnouncement, setModeAnnouncement] = useState("");
  const [devAnnouncement, setDevAnnouncement] = useState("");
  const [sectionAnnouncement, setSectionAnnouncement] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const linksRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { user, loading } = useAuth();
  const [devEnabled, setDevEnabledState] = useState(isDevEnabled());
  const isLive = isLiveMode();
  // Get current role from centralized system
  const [currentRole, setCurrentRole] = useState<Role>(getRole());

  // Accordion state - persist open sections in localStorage
  const getInitialOpenSections = (): string[] => {
    if (typeof window === 'undefined') return ['learn'];
    
    try {
      const stored = localStorage.getItem('menuOpen');
      return stored ? JSON.parse(stored) : ['learn'];
    } catch {
      return ['learn'];
    }
  };

  const [openSections, setOpenSections] = useState<string[]>(getInitialOpenSections());
  
  // Hide menu in course fullscreen mode (MUST be after ALL hooks)
  if (isCourseFullscreen()) return null;

  // Handle accordion changes with announcements
  const handleAccordionChange = (newSections: string[]) => {
    const previousSections = openSections;
    setOpenSections(newSections);

    // Announce section state changes
    const expanded = newSections.filter(s => !previousSections.includes(s));
    const collapsed = previousSections.filter(s => !newSections.includes(s));

    if (expanded.length > 0) {
      const sectionName = expanded[0].replace('nav-section-', '').replace(/-/g, ' ');
      setSectionAnnouncement(`${sectionName} section expanded`);
    } else if (collapsed.length > 0) {
      const sectionName = collapsed[0].replace('nav-section-', '').replace(/-/g, ' ');
      setSectionAnnouncement(`${sectionName} section collapsed`);
    }
  };

  // Persist open sections to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('menuOpen', JSON.stringify(openSections));
    }
  }, [openSections]);

  // Listen for role changes
  useEffect(() => {
    const cleanup = onRoleChange((newRole) => {
      setCurrentRole(newRole);
      setRoleAnnouncement(`Role changed to ${newRole}`);
    });
    
    return cleanup;
  }, []);

  // Listen for dev mode changes
  useEffect(() => {
    const cleanup = onDevChange((enabled) => {
      setDevEnabledState(enabled);
      setDevAnnouncement(`Dev mode ${enabled ? 'enabled' : 'disabled'}`);
    });
    
    return cleanup;
  }, []);

  // Filter nav based on current role and dev settings
  const sections = filterNav({ role: currentRole, devEnabled });

  // Handle menu state changes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    setAnnouncement(newOpen ? "Menu opened" : "Menu closed");
    
    // Restore focus to trigger button when closing
    if (!newOpen) {
      setTimeout(() => triggerRef.current?.focus(), 0);
    }
  };

  // Handle mode toggle (LIVE/MOCK)
  const handleModeToggle = () => {
    const newMode = isLive ? 'MOCK' : 'LIVE';
    localStorage.setItem('useMock', isLive ? 'true' : 'false');
    
    setModeAnnouncement(`Mode changed to ${newMode}`);
    
    toast({
      title: "Mode switched",
      description: `Now using ${newMode} mode`,
      duration: 2000,
    });
    
    // Reload to apply mode change
    setTimeout(() => window.location.reload(), 500);
  };

  // Handle role change from dropdown
  const handleRoleChange = (newRole: Role) => {
    setRole(newRole);
    setRoleAnnouncement(`Role changed to ${newRole}`);
    toast({
      title: "Role switched",
      description: `Now viewing as ${newRole}`,
      duration: 2000,
    });
  };

  // Handle dev mode toggle
  const handleDevToggle = () => {
    const newDevEnabled = !devEnabled;
    setDevEnabled(newDevEnabled);
    setDevAnnouncement(`Dev mode ${newDevEnabled ? 'enabled' : 'disabled'}`);
    toast({
      title: "Dev mode " + (newDevEnabled ? "enabled" : "disabled"),
      description: newDevEnabled ? "Dev tools now visible" : "Dev tools hidden",
      duration: 2000,
    });
  };

  // Close menu when route changes
  useEffect(() => {
    if (open) {
      handleOpenChange(false);
    }
  }, [location.pathname]);

  // Keyboard shortcut: Ctrl/Cmd+K to toggle menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        handleOpenChange(!open);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Keyboard navigation within menu
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const validLinks = linksRef.current.filter((link) => link !== null);
      const currentIndex = validLinks.findIndex(
        (link) => link === document.activeElement
      );

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % validLinks.length;
        validLinks[nextIndex]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex =
          currentIndex <= 0 ? validLinks.length - 1 : currentIndex - 1;
        validLinks[prevIndex]?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Accessible announcement region for menu state */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Accessible announcement region for role changes */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {roleAnnouncement}
      </div>

      {/* Accessible announcement region for mode changes */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {modeAnnouncement}
      </div>

      {/* Accessible announcement region for dev mode changes */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {devAnnouncement}
      </div>

      {/* Accessible announcement region for section expand/collapse */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {sectionAnnouncement}
      </div>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            aria-label="Open navigation menu (Ctrl+K)"
            aria-keyshortcuts="Control+K"
          >
            {open ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </Button>
        </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:w-[400px] overflow-y-auto"
        aria-modal="true"
      >
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>

        {/* Profile Section */}
        {user && !user.is_anonymous && (
          <div className="mt-6 mb-4 px-4 py-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Logged in
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  try {
                    await supabase.auth.signOut();
                    toast({
                      title: "Logged out",
                      description: "You have been logged out successfully",
                    });
                    handleOpenChange(false);
                    navigate("/auth");
                  } catch (error) {
                    console.error("Logout error:", error);
                  }
                }}
                className="shrink-0 h-9 w-9"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {!user || user.is_anonymous ? (
          <div className="mt-6 mb-4 px-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                handleOpenChange(false);
                navigate("/auth");
              }}
            >
              Login
            </Button>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            <nav className="mt-8" role="navigation">
              <Accordion 
                type="multiple" 
                value={openSections} 
                onValueChange={handleAccordionChange}
                className="space-y-2"
              >
                {sections.map((section, sectionIndex) => {
                  const sectionId = `nav-section-${section.title.toLowerCase().replace(/\s+/g, '-')}`;
                  
                  return (
                    <AccordionItem 
                      key={section.title} 
                      value={sectionId}
                      className="border-none"
                    >
                      <AccordionTrigger 
                        className="px-4 py-3 text-sm font-semibold text-foreground/70 uppercase tracking-wider hover:no-underline hover:text-foreground transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-4"
                        aria-label={`${section.title} section`}
                      >
                        {section.title}
                      </AccordionTrigger>
                      
                      <AccordionContent className="pb-2">
                        <ul className="space-y-1" role="list">
                          {section.items.map((item, itemIndex) => {
                            const linkIndex =
                              sections
                                .slice(0, sectionIndex)
                                .reduce((sum, s) => sum + s.items.length, 0) + itemIndex;

                            return (
                              <li key={item.id}>
                                <Link
                                  ref={(el) => (linksRef.current[linkIndex] = el)}
                                  to={item.path}
                                  className={`
                                    flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium
                                    min-h-[44px] transition-colors
                                    focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-4
                                    ${
                                      isActive(item.path)
                                        ? "bg-primary text-primary-foreground"
                                        : "hover:bg-muted/80 text-foreground"
                                    }
                                  `}
                                  aria-current={isActive(item.path) ? "page" : undefined}
                                >
                                  {item.icon && (() => {
                                    const Icon = getIcon(item.icon);
                                    return Icon ? (
                                      <span className="shrink-0" aria-hidden="true">
                                        <Icon className="h-4 w-4" />
                                      </span>
                                    ) : null;
                                  })()}
                                  <span>{item.label}</span>
                                  {item.external && (
                                    <span className="ml-auto text-xs" aria-label="Opens in new window">
                                      ↗
                                    </span>
                                  )}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </nav>

            {/* Footer controls */}
            <div className="mt-8 border-t pt-6">
              <div className="px-4 space-y-4">
                {/* Dev Tools Toggle */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    Dev Tools
                  </label>
                  <button
                    onClick={handleDevToggle}
                    className={`w-full px-4 py-3 rounded-lg font-medium text-sm transition-all border-2 min-h-[44px] flex items-center justify-between
                      focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-4
                      ${
                      devEnabled
                        ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20'
                        : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                    }`}
                    aria-label={`Dev tools ${devEnabled ? 'enabled' : 'disabled'}. Click to toggle.`}
                  >
                    <span>{devEnabled ? 'ON' : 'OFF'}</span>
                    <div className={`w-12 h-6 rounded-full transition-colors ${devEnabled ? 'bg-amber-500' : 'bg-muted-foreground/30'} relative`}>
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${devEnabled ? 'translate-x-6' : ''}`} />
                    </div>
                  </button>
                  <p className="text-xs text-foreground/50">
                    Shows Test Runner and Health Check
                  </p>
                </div>

                {/* Mode Toggle (LIVE/MOCK) */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    API Mode
                  </label>
                  <button
                    onClick={handleModeToggle}
                    className={`w-full px-4 py-3 rounded-lg font-medium text-sm transition-all border-2 min-h-[44px]
                      focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-4
                      ${
                      isLive
                        ? 'bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/20'
                        : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                    }`}
                    aria-label={`Current mode: ${isLive ? 'Live' : 'Mock'}. Click to toggle.`}
                  >
                    {isLive ? 'LIVE' : 'MOCK'}
                  </button>
                  <p className="text-xs text-foreground/50">
                    Click to switch between live and mock data
                  </p>
                </div>

                {/* Role Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    View As Role
                  </label>
                  <Select value={currentRole} onValueChange={handleRoleChange}>
                    <SelectTrigger className="w-full bg-background min-h-[44px] focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-4">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-[100]">
                      <SelectItem value="student" className="min-h-[44px]">Student</SelectItem>
                      <SelectItem value="teacher" className="min-h-[44px]">Teacher</SelectItem>
                      <SelectItem value="parent" className="min-h-[44px]">Parent</SelectItem>
                      <SelectItem value="school" className="min-h-[44px]">School</SelectItem>
                      <SelectItem value="admin" className="min-h-[44px]">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-foreground/50">
                    Changes which menu items are visible
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
    </>
  );
};

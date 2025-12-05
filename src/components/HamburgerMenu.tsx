import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Home, User, Users, BookOpen, Settings, BarChart, MessageSquare, GraduationCap, Target, Trophy, Calendar, Briefcase, Activity, Cpu, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const menuSections = [
  {
    title: "Main",
    items: [
      { path: "/", label: "Landing", icon: Home },
      { path: "/about", label: "About", icon: Info },
      { path: "/auth", label: "Auth", icon: User },
      { path: "/settings", label: "Settings", icon: Settings },
      { path: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  {
    title: "Student",
    items: [
      { path: "/student/dashboard", label: "Dashboard", icon: Home },
      { path: "/student/assignments", label: "Assignments", icon: BookOpen },
      { path: "/student/achievements", label: "Achievements", icon: Trophy },
      { path: "/student/goals", label: "Goals", icon: Target },
      { path: "/student/timeline", label: "Timeline", icon: Calendar },
      { path: "/student/join-class", label: "Join Class", icon: Users },
    ],
  },
  {
    title: "Teacher",
    items: [
      { path: "/teacher/dashboard", label: "Dashboard", icon: Home },
      { path: "/teacher/classes", label: "Classes", icon: Users },
      { path: "/teacher/students", label: "Students", icon: GraduationCap },
      { path: "/teacher/assignments", label: "Assignments", icon: BookOpen },
      { path: "/teacher/assignment-progress", label: "Assignment Progress", icon: BarChart },
      { path: "/teacher/class-progress", label: "Class Progress", icon: BarChart },
      { path: "/teacher/analytics", label: "Analytics", icon: BarChart },
      { path: "/teacher/control", label: "Control", icon: Settings },
    ],
  },
  {
    title: "Parent",
    items: [
      { path: "/parent/dashboard", label: "Dashboard", icon: Home },
      { path: "/parent/subjects", label: "Subjects", icon: BookOpen },
      { path: "/parent/goals", label: "Goals", icon: Target },
      { path: "/parent/timeline", label: "Timeline", icon: Calendar },
    ],
  },
  {
    title: "Play",
    items: [
      { path: "/play/welcome", label: "Welcome", icon: Home },
      { path: "/play", label: "Session", icon: BookOpen },
      { path: "/play/media", label: "Media", icon: BookOpen },
      { path: "/results", label: "Results", icon: Trophy },
    ],
  },
  {
    title: "Admin",
    items: [
      { path: "/admin/console", label: "Console", icon: Settings },
      { path: "/admin/jobs", label: "Jobs", icon: Briefcase },
      { path: "/admin/system-health", label: "System Health", icon: Activity },
      { path: "/admin/ai-pipeline", label: "AI Pipeline", icon: Cpu },
    ],
  },
  {
    title: "Catalog",
    items: [
      { path: "/catalog-builder", label: "Builder", icon: BookOpen },
      { path: "/catalog-builder/media", label: "Media", icon: BookOpen },
    ],
  },
];

export const HamburgerMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-background border border-border shadow-lg hover:bg-accent transition-colors"
        aria-label="Toggle menu"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Menu Panel */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full w-72 bg-background border-r border-border shadow-xl z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 pt-16">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Navigation</h2>
          
          {menuSections.map((section) => (
            <div key={section.title} className="mb-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {section.title}
              </h3>
              <nav className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

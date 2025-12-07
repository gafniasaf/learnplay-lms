import { NavLink, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  BookOpen, 
  ListChecks, 
  Clock, 
  Target,
  ChevronRight 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Breadcrumb, 
  BreadcrumbItem, 
  BreadcrumbLink, 
  BreadcrumbList, 
  BreadcrumbPage, 
  BreadcrumbSeparator 
} from "@/components/ui/breadcrumb";
// Tabs imports removed - not used
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface ParentLayoutProps {
  children: React.ReactNode;
}

const parentNavItems = [
  { id: "overview", label: "Overview", path: "/parent/dashboard", icon: LayoutDashboard },
  { id: "subjects", label: "Subjects", path: "/parent/subjects", icon: BookOpen },
  { id: "topics", label: "Topics", path: "/parent/topics", icon: ListChecks },
  { id: "timeline", label: "Timeline", path: "/parent/timeline", icon: Clock },
  { id: "goals", label: "Goals", path: "/parent/goals", icon: Target },
];

export const ParentLayout = ({ children }: ParentLayoutProps) => {
  const location = useLocation();
  const currentPath = location.pathname;

  // Get current page name for breadcrumb
  const currentNavItem = parentNavItems.find(item => item.path === currentPath);
  const pageName = currentNavItem?.label || "Dashboard";

  return (
    <div className="space-y-6">
      {/* Header with Breadcrumbs and Menu */}
      <div className="flex items-center justify-between gap-4">
        <Breadcrumb className="flex-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight className="h-4 w-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbLink href="/parents">Parent</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight className="h-4 w-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage>{pageName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      
      </div>

      {/* Sub-navigation Tabs */}
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex items-center border-b">
          {parentNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.path;
            
            return (
              <NavLink
                key={item.id}
                to={item.path}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Page Content */}
      <div className="pb-8">
        {children}
      </div>
    </div>
  );
};

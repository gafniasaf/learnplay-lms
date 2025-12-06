import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ListTodo, Clock, Award, Target } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", path: "/student/dashboard", icon: LayoutDashboard },
  { id: "assignments", label: "Assignments", path: "/student/assignments", icon: ListTodo },
  { id: "timeline", label: "Timeline", path: "/student/timeline", icon: Clock },
  { id: "achievements", label: "Achievements", path: "/student/achievements", icon: Award },
  { id: "goals", label: "Goals", path: "/student/goals", icon: Target },
];

interface StudentLayoutProps {
  children: React.ReactNode;
}

export function StudentLayout({ children }: StudentLayoutProps) {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/student/dashboard">Student</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              {NAV_ITEMS.find((item) => item.path === currentPath)?.label || "Dashboard"}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <nav className="flex gap-1 border-b overflow-x-auto pb-px" role="navigation" aria-label="Student dashboard navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.path;
          
          return (
            <Link
              key={item.id}
              to={item.path}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap rounded-t-md",
                isActive 
                  ? "bg-background text-foreground border-b-2 border-primary" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}


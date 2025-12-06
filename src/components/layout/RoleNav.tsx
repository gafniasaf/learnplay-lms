import { NavLink } from "react-router-dom";
import { Baby, Users, GraduationCap, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const roles = [
  { path: "/kids", label: "Kids", icon: Baby, color: "role-kids" },
  { path: "/parent/dashboard", label: "Parents", icon: Users, color: "role-parents" },
  { path: "/schools", label: "Schools", icon: GraduationCap, color: "role-schools" },
  { path: "/admin", label: "Admin", icon: Shield, color: "role-admin" },
];

export const RoleNav = () => {
  return (
    <nav className="flex gap-2">
      {roles.map(({ path, label, icon: Icon, color }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium transition-all",
              isActive
                ? `bg-${color} text-white shadow-md`
                : "text-foreground/70 hover:text-foreground hover:bg-secondary"
            )
          }
          style={({ isActive }) =>
            isActive
              ? { backgroundColor: `hsl(var(--${color}))` }
              : undefined
          }
        >
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

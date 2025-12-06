import { Link } from "react-router-dom";
import { Baby, Users, GraduationCap, Shield } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";

const roles = [
  {
    path: "/kids",
    label: "Kids",
    icon: Baby,
    color: "role-kids",
    description: "Fun games and interactive learning",
  },
  {
    path: "/parent/dashboard",
    label: "Parents",
    icon: Users,
    color: "role-parents",
    description: "Track progress and support learning",
  },
  {
    path: "/schools",
    label: "Schools",
    icon: GraduationCap,
    color: "role-schools",
    description: "Manage classes and curriculum",
  },
  {
    path: "/admin",
    label: "Admin",
    icon: Shield,
    color: "role-admin",
    description: "System administration and settings",
  },
];

const Home = () => {
  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Welcome to LearnPlay
        </h1>
        <p className="text-xl text-muted-foreground">
          Choose your portal to get started
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {roles.map(({ path, label, icon: Icon, color, description }) => (
          <Link
            key={path}
            to={path}
            className="group relative overflow-hidden rounded-2xl border bg-card p-8 transition-all hover:shadow-lg hover:scale-[1.02]"
            style={{
              borderColor: `hsl(var(--${color}) / 0.3)`,
            }}
          >
            <div
              className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-opacity"
              style={{
                backgroundColor: `hsl(var(--${color}))`,
              }}
            />
            
            <div className="relative">
              <div
                className="inline-flex p-3 rounded-2xl mb-4"
                style={{
                  backgroundColor: `hsl(var(--${color}) / 0.1)`,
                }}
              >
                <Icon
                  className="h-8 w-8"
                  style={{ color: `hsl(var(--${color}))` }}
                />
              </div>
              
              <h2 className="text-2xl font-bold mb-2">{label}</h2>
              <p className="text-muted-foreground">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
};

export default Home;

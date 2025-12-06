import { ReactNode } from "react";
import { Header } from "./Header";
import { isEmbed } from "@/lib/embed";

interface AdminLayoutProps {
  children: ReactNode;
}

export const AdminLayout = ({ children }: AdminLayoutProps) => {
  const embedMode = isEmbed();
  
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {!embedMode && <Header />}
      <main className={`flex-1 overflow-hidden ${embedMode ? "p-2 md:p-3" : ""}`}>
        {children}
      </main>
    </div>
  );
};

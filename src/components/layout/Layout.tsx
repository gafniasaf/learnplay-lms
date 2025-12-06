import { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { isEmbed } from "@/lib/embed";
import { FallbackBanner } from "@/components/system/FallbackBanner";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const embedMode = isEmbed();
  
  return (
    <div className="flex min-h-screen flex-col">
      {!embedMode && <Header />}
      {!embedMode && <FallbackBanner />}
      <main className={`flex-1 ${embedMode ? "p-2 md:p-3" : ""}`}>
        {children}
      </main>
      {!embedMode && <Footer />}
    </div>
  );
};

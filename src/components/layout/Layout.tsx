import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Header } from "./Header";
import { isCourseFullscreen, isEmbed } from "@/lib/embed";
import { FallbackBanner } from "@/components/system/FallbackBanner";
import { ModeBanner } from "@/components/system/ModeBanner";
import { CourseFrame } from "@/components/layout/CourseFrame";
import { DawnDataBanner } from "@/components/system/DawnDataBanner";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const embedMode = isEmbed();
  const fullscreen = !embedMode && isCourseFullscreen();

  // Pixel-perfect admin dashboards that include their own chrome (no app header/banners).
  const hideChrome = location.pathname === "/admin/book-monitor";
  const showChrome = !embedMode && !fullscreen && !hideChrome;
  
  return (
    <div className="flex min-h-screen flex-col">
      {showChrome && <Header />}
      {showChrome && <ModeBanner />}
      {showChrome && <DawnDataBanner />}
      {showChrome && <FallbackBanner />}
      <main className={`flex-1 ${embedMode ? "p-2 md:p-3" : ""}`}>
        {fullscreen ? <CourseFrame>{children}</CourseFrame> : children}
      </main>
    </div>
  );
};

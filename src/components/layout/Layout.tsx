import { ReactNode } from "react";
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
  const embedMode = isEmbed();
  const fullscreen = !embedMode && isCourseFullscreen();
  
  return (
    <div className="flex min-h-screen flex-col">
      {!embedMode && !fullscreen && <Header />}
      {!embedMode && !fullscreen && <ModeBanner />}
      {!embedMode && !fullscreen && <DawnDataBanner />}
      {!embedMode && !fullscreen && <FallbackBanner />}
      <main className={`flex-1 ${embedMode ? "p-2 md:p-3" : ""}`}>
        {fullscreen ? <CourseFrame>{children}</CourseFrame> : children}
      </main>
    </div>
  );
};

import { ReactNode } from "react";
import { BuilderMenu } from "./BuilderMenu";

interface BuilderShellProps {
  children: ReactNode;
}

export const BuilderShell = ({ children }: BuilderShellProps) => {
  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-200">
      <div className="fixed top-6 right-4 sm:top-8 sm:right-8 z-[60] drop-shadow-xl">
        <BuilderMenu />
      </div>
      {children}
    </div>
  );
};



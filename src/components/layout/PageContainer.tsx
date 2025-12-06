import { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export const PageContainer = ({ children, className = "" }: PageContainerProps) => {
  return (
    <div className={`container py-12 ${className}`}>
      {children}
    </div>
  );
};

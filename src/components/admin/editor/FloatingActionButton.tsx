import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FABAction {
  id: string;
  label: string;
  icon: string;
  onClick: () => void;
}

interface FloatingActionButtonProps {
  actions: FABAction[];
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  actions,
}) => {
  const [open, setOpen] = useState(false);

  const handleToggle = () => {
    setOpen((prev) => !prev);
  };

  const handleAction = (action: FABAction) => {
    action.onClick();
    setOpen(false);
  };

  return (
    <div className="fixed bottom-6 right-[calc(1.5rem+340px)] flex flex-col items-end gap-3 z-50">
      {/* Menu Items */}
      <div
        className={cn(
          'flex flex-col gap-2 transition-all duration-200',
          open
            ? 'opacity-100 visible translate-y-0'
            : 'opacity-0 invisible translate-y-2.5'
        )}
      >
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => handleAction(action)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium shadow-md cursor-pointer whitespace-nowrap transition-all hover:border-blue-500 hover:bg-blue-50"
            data-cta-id={`cta-courseeditor-fab-${action.id}`}
            data-action="action"
          >
            <span>{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* FAB Button */}
      <button
        onClick={handleToggle}
        className={cn(
          'w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white border-none shadow-lg cursor-pointer flex items-center justify-center text-2xl transition-all hover:scale-105 hover:shadow-xl',
          open && 'rotate-45'
        )}
        data-cta-id="cta-courseeditor-fab-toggle"
        data-action="action"
      >
        <Sparkles className="h-6 w-6" />
      </button>
    </div>
  );
};


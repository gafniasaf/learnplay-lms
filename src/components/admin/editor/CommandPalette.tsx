import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Command {
  id: string;
  title: string;
  description: string;
  icon: string;
  shortcut?: string[];
  action: () => void;
  group: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  commands,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
        e.preventDefault();
        filteredCommands[selectedIndex].action();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, query]);

  const filteredCommands = React.useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q)
    );
  }, [commands, query]);

  const groupedCommands = React.useMemo(() => {
    const groups: Record<string, Command[]> = {};
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.group]) {
        groups[cmd.group] = [];
      }
      groups[cmd.group].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[15vh] z-50 transition-opacity"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="w-full max-w-[560px] bg-white rounded-2xl shadow-2xl overflow-hidden transform transition-transform"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center px-4 py-4 border-b border-gray-200">
          <Search className="h-5 w-5 text-gray-400 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 border-none outline-none text-lg font-normal"
          />
        </div>

        {/* Commands List */}
        <div className="max-h-[400px] overflow-y-auto p-2">
          {Object.entries(groupedCommands).map(([groupName, groupCommands]) => (
            <div key={groupName} className="mb-3">
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {groupName}
              </div>
              {groupCommands.map((cmd, idx) => {
                const globalIndex = filteredCommands.indexOf(cmd);
                const isSelected = globalIndex === selectedIndex;
                return (
                  <div
                    key={cmd.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-md cursor-pointer transition-colors',
                      isSelected && 'bg-gray-50'
                    )}
                    onClick={() => {
                      cmd.action();
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    data-cta-id={`cta-courseeditor-command-${cmd.id}`}
                    data-action="action"
                  >
                    <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-md text-lg">
                      {cmd.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-[15px]">{cmd.title}</div>
                      <div className="text-[13px] text-gray-400">{cmd.description}</div>
                    </div>
                    {cmd.shortcut && (
                      <div className="flex gap-1">
                        {cmd.shortcut.map((key, i) => (
                          <kbd
                            key={i}
                            className="px-1.5 py-0.5 text-[11px] font-mono bg-gray-100 border border-gray-200 rounded text-gray-500"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {filteredCommands.length === 0 && (
            <div className="px-3 py-8 text-center text-gray-400">
              No commands found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


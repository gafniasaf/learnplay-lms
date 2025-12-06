import { useState, useEffect } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NumericPadProps {
  onSubmit: (value: number) => void;
  disabled?: boolean;
  phase?: 'idle' | 'committing' | 'feedback-correct' | 'feedback-wrong' | 'advancing';
}

export const NumericPad = ({
  onSubmit,
  disabled = false,
  phase = 'idle',
}: NumericPadProps) => {
  const [input, setInput] = useState<string>("");

  // Reset input when a new item is shown (phase returns to idle)
  useEffect(() => {
    if (phase === 'idle') {
      setInput("");
    }
  }, [phase]);

  const handleDigit = (digit: string) => {
    if (disabled) return;
    
    // Limit input length (e.g., max 10 digits)
    if (input.length < 10) {
      setInput(input + digit);
    }
  };

  const handleDelete = () => {
    if (disabled) return;
    setInput(input.slice(0, -1));
  };

  const handleClear = () => {
    if (disabled) return;
    setInput("");
  };

  const handleSubmit = () => {
    if (disabled || !input) return;
    
    const numValue = parseFloat(input);
    if (!isNaN(numValue)) {
      onSubmit(numValue);
    }
  };

  // Keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === ".") {
        e.preventDefault();
        if (!input.includes(".")) {
          handleDigit(".");
        }
      } else if (e.key === "-" && input === "") {
        e.preventDefault();
        handleDigit("-");
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleDelete();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
      } else if (e.key === "Enter" && input) {
        e.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, input]);

  const isLocked = phase !== 'idle';

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-md">
      {/* Display */}
      <div
        className={cn(
          "w-full min-h-14 p-4 rounded-2xl border-2 bg-card text-center",
          "text-2xl font-bold flex items-center justify-center",
          input ? "border-primary" : "border-border"
        )}
        role="status"
        aria-live="polite"
        aria-label={input ? `Current input: ${input}` : "Enter your answer"}
      >
        {input || <span className="text-muted-foreground">?</span>}
      </div>

      {/* Numeric Keypad */}
      <div className="grid grid-cols-3 gap-2 w-full">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((digit) => (
          <Button
            key={digit}
            onClick={() => handleDigit(digit)}
            disabled={isLocked}
            size="lg"
            variant="outline"
            className="h-12 text-xl font-semibold hover:scale-[1.02] active:scale-[0.98] transition-transform"
            aria-label={`Digit ${digit}`}
          >
            {digit}
          </Button>
        ))}
        
        {/* Bottom row: decimal, 0, negative */}
        <Button
          onClick={() => !input.includes(".") && handleDigit(".")}
          disabled={isLocked || input.includes(".")}
          size="lg"
          variant="outline"
          className="h-12 text-xl font-semibold hover:scale-[1.02] active:scale-[0.98] transition-transform"
          aria-label="Decimal point"
        >
          .
        </Button>
        
        <Button
          onClick={() => handleDigit("0")}
          disabled={isLocked}
          size="lg"
          variant="outline"
          className="h-12 text-xl font-semibold hover:scale-[1.02] active:scale-[0.98] transition-transform"
          aria-label="Digit 0"
        >
          0
        </Button>
        
        <Button
          onClick={() => input === "" && handleDigit("-")}
          disabled={isLocked || input !== ""}
          size="lg"
          variant="outline"
          className="h-12 text-xl font-semibold hover:scale-[1.02] active:scale-[0.98] transition-transform"
          aria-label="Negative sign"
        >
          −
        </Button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 w-full">
        <Button
          onClick={handleDelete}
          disabled={isLocked || !input}
          size="lg"
          variant="outline"
          className="flex-1 h-11 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform"
          aria-label="Delete last digit"
        >
          <Delete className="h-4 w-4 mr-1" aria-hidden="true" />
          Delete
        </Button>
        
        <Button
          onClick={handleClear}
          disabled={isLocked || !input}
          size="lg"
          variant="outline"
          className="flex-1 h-11 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform"
          aria-label="Clear all"
        >
          Clear
        </Button>
        
        <Button
          onClick={handleSubmit}
          disabled={isLocked || !input}
          size="lg"
          className="flex-1 h-11 text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform"
          aria-label="Submit answer"
        >
          Submit
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center" aria-live="polite">
        Type your answer or use the keypad. Press Enter to submit.
      </p>
    </div>
  );
};

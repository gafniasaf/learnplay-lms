/**
 * Skip link for keyboard navigation
 * Allows users to skip directly to main game content
 * Visible when focused for keyboard users
 */
export const SkipLink = () => {
  return (
    <a
      href="#main-game-area"
      className="skip-link sr-only focus-visible:not-sr-only fixed top-4 left-4 z-[9999] px-6 py-3 bg-primary text-primary-foreground rounded-2xl font-semibold shadow-lg hover:bg-primary/90 transition-colors"
      aria-label="Skip to main game content"
    >
      Skip to game
    </a>
  );
};

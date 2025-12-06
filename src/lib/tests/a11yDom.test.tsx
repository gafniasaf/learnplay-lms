/**
 * Accessibility DOM Smoke Tests
 * Lightweight tests for component accessibility features
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { OptionGrid } from "@/components/game/OptionGrid";
import WrongModal from "@/components/game/WrongModal";

/**
 * Check if DOM APIs are available
 */
function isDomAvailable(): boolean {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

/**
 * Create a detached container for mounting components
 */
function createContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.id = "test-root";
  document.body.appendChild(container);
  return container;
}

/**
 * Clean up container after test
 */
function cleanupContainer(container: HTMLDivElement) {
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
  }
}

/**
 * Wait for component to render
 */
async function waitForRender(ms: number = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test 1: OptionGrid button roles and tabIndex
 */
async function testOptionGridAccessibility(): Promise<{
  pass: boolean;
  details: any;
}> {
  const container = createContainer();
  const root = createRoot(container);
  let selectCallCount = 0;

  try {
    // Render OptionGrid
    root.render(
      <OptionGrid
        options={["Option A", "Option B", "Option C"]}
        onSelect={() => selectCallCount++}
        disabled={false}
      />
    );

    await waitForRender();

    // Check for button elements
    const buttons = container.querySelectorAll("button");
    
    if (buttons.length !== 3) {
      return {
        pass: false,
        details: {
          test: "option-grid",
          error: `Expected 3 buttons, found ${buttons.length}`,
        },
      };
    }

    // Check each button has correct attributes
    const buttonChecks = Array.from(buttons).map((btn, index) => {
      const hasRole = btn.getAttribute("role") === "button";
      const hasTabIndex = btn.getAttribute("tabindex") === "0";
      const hasAriaLabel = !!btn.getAttribute("aria-label");
      
      return {
        index,
        hasRole,
        hasTabIndex,
        hasAriaLabel,
        valid: hasRole && hasTabIndex && hasAriaLabel,
      };
    });

    const allButtonsValid = buttonChecks.every((check) => check.valid);

    // Test keyboard handler (Enter)
    const firstButton = buttons[0];
    firstButton.focus();
    
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    
    window.dispatchEvent(enterEvent);
    await waitForRender(10);

    const enterTriggered = selectCallCount > 0;

    return {
      pass: allButtonsValid && enterTriggered,
      details: {
        test: "option-grid",
        buttonCount: buttons.length,
        buttonChecks,
        allButtonsValid,
        keyboardHandler: {
          enterTriggered,
          callCount: selectCallCount,
        },
      },
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        test: "option-grid",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    root.unmount();
    cleanupContainer(container);
  }
}

/**
 * Test 2: WrongModal focus trap and ESC handling
 */
async function testWrongModalAccessibility(): Promise<{
  pass: boolean;
  details: any;
}> {
  const container = createContainer();
  const root = createRoot(container);
  let closeCallCount = 0;

  try {
    // Render WrongModal (open)
    root.render(
      <WrongModal
        open={true}
        onClose={() => closeCallCount++}
        item={{
          text: "This is ___ correct sentence.",
          options: ["the", "a", "an", "some"],
          correctIndex: 0,
          explain: "This explains why it's correct."
        }}
      />
    );

    await waitForRender(150); // Wait a bit longer for dialog to render

    // Check for dialog element
    const dialog = container.querySelector('[role="dialog"]');
    
    if (!dialog) {
      return {
        pass: false,
        details: {
          test: "wrong-modal",
          error: "Dialog element not found",
        },
      };
    }

    // Check for OK button (changed from continue button)
    const okButton = container.querySelector(
      'button[aria-label="Close explanation"]'
    ) as HTMLButtonElement;

    if (!okButton) {
      return {
        pass: false,
        details: {
          test: "wrong-modal",
          error: "OK button not found",
        },
      };
    }

    // Test ESC key (should close with new implementation)
    const escEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });

    dialog.dispatchEvent(escEvent);
    await waitForRender(10);

    // Modal should close on ESC
    const escTriggered = closeCallCount > 0;
    closeCallCount = 0; // Reset for next test

    // Test clicking OK button
    okButton.click();
    await waitForRender(10);

    const buttonTriggered = closeCallCount > 0;

    return {
      pass: !!dialog && !!okButton && escTriggered && buttonTriggered,
      details: {
        test: "wrong-modal",
        dialogFound: !!dialog,
        okButtonFound: !!okButton,
        escAndClick: {
          escTriggered,
          buttonTriggered,
          closeCallCount,
        },
      },
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        test: "wrong-modal",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    root.unmount();
    cleanupContainer(container);
  }
}

/**
 * Run all accessibility DOM tests
 */
export async function runA11yDomTests(): Promise<{
  pass: boolean;
  details: any;
}> {
  // Skip if DOM APIs not available
  if (!isDomAvailable()) {
    return {
      pass: true,
      details: {
        status: "skipped",
        reason: "DOM APIs not available in this environment",
      },
    };
  }

  try {
    const [optionGridResult, wrongModalResult] = await Promise.all([
      testOptionGridAccessibility(),
      testWrongModalAccessibility(),
    ]);

    const allPass = optionGridResult.pass && wrongModalResult.pass;

    return {
      pass: allPass,
      details: {
        status: "success",
        optionGrid: optionGridResult,
        wrongModal: wrongModalResult,
        summary: {
          total: 2,
          passed: [optionGridResult.pass, wrongModalResult.pass].filter(Boolean)
            .length,
        },
      },
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        error: `A11y DOM tests failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }
}

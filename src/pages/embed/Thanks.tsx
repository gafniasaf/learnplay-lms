import { useEffect } from "react";
import { CheckCircle } from "lucide-react";
import { isEmbed, postToHost } from "@/lib/embed";

/**
 * Thanks page shown when host sends "quit" command in embed mode
 */
export default function EmbedThanks() {
  useEffect(() => {
    // Notify parent that we've navigated to thanks page
    if (isEmbed()) {
      postToHost({ 
        type: "exit", 
        payload: {} 
      });
    }
  }, []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="inline-flex p-6 rounded-full bg-primary/10 mb-6 animate-in fade-in zoom-in duration-500">
          <CheckCircle className="h-16 w-16 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
          Thanks for playing!
        </h1>
        <p className="text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
          You can now close this window or return to the parent page.
        </p>
      </div>
    </div>
  );
}

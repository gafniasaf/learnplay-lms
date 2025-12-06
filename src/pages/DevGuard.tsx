import { Link } from "react-router-dom";
import { AlertTriangle, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DevGuard() {
  const currentUrl = window.location.pathname + window.location.search;
  const devUrl = currentUrl.includes("?")
    ? `${currentUrl}&dev=1`
    : `${currentUrl}?dev=1`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 rounded-full bg-yellow-500/10">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
            </div>
            
            <div>
              <h1 className="text-2xl font-bold mb-2">Dev Route Protected</h1>
              <p className="text-muted-foreground mb-4">
                This route is only accessible in development mode.
              </p>
            </div>

            <div className="w-full space-y-2">
              <Button asChild className="w-full" size="lg">
                <a href={devUrl}>
                  <Code className="h-4 w-4 mr-2" />
                  Enable Dev Mode
                </a>
              </Button>
              
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Return Home</Link>
              </Button>
            </div>

            <div className="text-xs text-muted-foreground pt-4 border-t w-full">
              <p>To enable dev routes permanently, set:</p>
              <code className="bg-muted px-2 py-1 rounded mt-1 inline-block">
                VITE_ENABLE_DEV=true
              </code>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

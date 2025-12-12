import { useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Copy, Play } from "lucide-react";
import { toast } from "sonner";

interface DiagResult {
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  error?: string;
}

export default function Diagnostics() {
  const [results, setResults] = useState<DiagResult[]>([]);
  const [running, setRunning] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const currentOrigin = window.location.origin;

  const runDiagnostics = async () => {
    setRunning(true);
    setResults([]);
    const newResults: DiagResult[] = [];

    // Note: 'test-course' is a placeholder - replace with a real course ID from your catalog
    const testUrls = [
      `${supabaseUrl}/functions/v1/list-courses`,
      `${supabaseUrl}/functions/v1/get-course?courseId=test-course`,
    ];

    for (const url of testUrls) {
      // Test OPTIONS
      try {
        const optionsRes = await fetch(url, {
          method: "OPTIONS",
          headers: {
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization, content-type, apikey, x-request-id, if-none-match, if-modified-since",
            ...(anonKey ? { "apikey": anonKey } : {}),
          },
        });

        const headers: Record<string, string> = {};
        optionsRes.headers.forEach((value, key) => {
          // Capture ALL headers for debugging
          headers[key] = value;
        });

        newResults.push({
          method: "OPTIONS",
          url,
          status: optionsRes.status,
          statusText: optionsRes.statusText,
          headers,
        });
      } catch (err) {
        newResults.push({
          method: "OPTIONS",
          url,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Test GET
      try {
        const getRes = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(anonKey ? { "apikey": anonKey } : {}),
          },
        });

        const headers: Record<string, string> = {};
        getRes.headers.forEach((value, key) => {
          // Capture ALL headers for debugging
          headers[key] = value;
        });

        newResults.push({
          method: "GET",
          url,
          status: getRes.status,
          statusText: getRes.statusText,
          headers,
        });
      } catch (err) {
        newResults.push({
          method: "GET",
          url,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    setResults(newResults);
    setRunning(false);
    toast.success("Diagnostics completed");
  };

  const copyJson = () => {
    const json = JSON.stringify(results, null, 2);
    navigator.clipboard.writeText(json);
    toast.success("Copied JSON to clipboard");
  };

  return (
    <PageContainer>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-primary/10">
              <Activity className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">Diagnostics</h1>
              <p className="text-muted-foreground">
                Test CORS and edge function connectivity
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Run Diagnostics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Button onClick={runDiagnostics} disabled={running} size="lg">
                <Play className="h-5 w-5 mr-2" />
                Run Diagnostics
              </Button>

              <Button
                onClick={copyJson}
                disabled={results.length === 0}
                variant="outline"
                size="lg"
              >
                <Copy className="h-5 w-5 mr-2" />
                Copy JSON
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground font-mono">
                  <strong>Current Origin:</strong> {currentOrigin}
                </p>
              </div>
              {!supabaseUrl && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive font-medium">
                    ⚠️ VITE_SUPABASE_URL not configured
                  </p>
                </div>
              )}
              {!anonKey && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive font-medium">
                    ⚠️ VITE_SUPABASE_PUBLISHABLE_KEY not configured
                  </p>
                </div>
              )}
              {anonKey && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    ✓ apikey is automatically included in requests
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((result, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{result.method}</Badge>
                      <code className="text-sm text-muted-foreground">
                        {result.url}
                      </code>
                    </div>
                    {result.status && (
                      <Badge
                        variant={
                          result.status >= 200 && result.status < 300
                            ? "default"
                            : "destructive"
                        }
                      >
                        {result.status} {result.statusText}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {result.error && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <p className="text-sm text-destructive font-mono">
                        {result.error}
                      </p>
                    </div>
                  )}

                  {result.headers && Object.keys(result.headers).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">
                        CORS Headers
                      </h4>
                      <div className="space-y-1">
                        {Object.entries(result.headers).map(([key, value]) => (
                          <div
                            key={key}
                            className="flex items-start gap-2 text-xs font-mono"
                          >
                            <span className="text-muted-foreground min-w-[200px]">
                              {key}:
                            </span>
                            <span className="flex-1 break-all">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {results.length === 0 && !running && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Click "Run Diagnostics" to test edge function connectivity</p>
              <p className="text-sm mt-2">
                Tests OPTIONS and GET requests to list-courses and get-course
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}

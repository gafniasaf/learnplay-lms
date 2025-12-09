import { useState } from "react";
import { isLiveMode } from "@/lib/env";
import { useGameSession } from "@/hooks/useGameSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle, XCircle, Activity } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TestResponse {
  type: string;
  status: 'success' | 'error';
  data?: any;
  error?: string;
  timestamp: string;
}

const DevHealth = () => {
  const isLive = isLiveMode();
  const gameSession = useGameSession();
  const [roundId, setRoundId] = useState<string | null>(null);
  const [responses, setResponses] = useState<TestResponse[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Test stats for end round
  const [testScore, setTestScore] = useState(5);
  const [testMistakes, setTestMistakes] = useState(2);

  const addResponse = (type: string, status: 'success' | 'error', data?: any, error?: string) => {
    setResponses(prev => [{
      type,
      status,
      data,
      error,
      timestamp: new Date().toISOString()
    }, ...prev].slice(0, 10)); // Keep last 10
  };

  const handleStartRound = async () => {
    setLoading(true);
    try {
      const result = await gameSession.startRound({ courseId: 'modals', level: 1 });
      setRoundId((result as { roundId: string }).roundId);
      addResponse('START_ROUND', 'success', result);
    } catch (err) {
      addResponse('START_ROUND', 'error', undefined, err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogCorrect = async () => {
    if (!roundId) {
      addResponse('LOG_ATTEMPT', 'error', undefined, 'No active round. Start a round first.');
      return;
    }

    setLoading(true);
    try {
      const result = await gameSession.logAttempt({
        roundId,
        itemId: 1,
        itemKey: '1:test:1',
        selectedIndex: 0,
        isCorrect: true,
        latencyMs: Math.floor(Math.random() * 3000) + 500,
      });
      addResponse('LOG_CORRECT', 'success', result);
      setTestScore(prev => prev + 1);
    } catch (err) {
      addResponse('LOG_CORRECT', 'error', undefined, err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogWrong = async () => {
    if (!roundId) {
      addResponse('LOG_ATTEMPT', 'error', undefined, 'No active round. Start a round first.');
      return;
    }

    setLoading(true);
    try {
      const result = await gameSession.logAttempt({
        roundId,
        itemId: 2,
        itemKey: '2:test:2',
        selectedIndex: 1,
        isCorrect: false,
        latencyMs: Math.floor(Math.random() * 3000) + 500,
      });
      addResponse('LOG_WRONG', 'success', result);
      setTestMistakes(prev => prev + 1);
    } catch (err) {
      addResponse('LOG_WRONG', 'error', undefined, err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleEndRound = async () => {
    if (!roundId) {
      addResponse('END_ROUND', 'error', undefined, 'No active round. Start a round first.');
      return;
    }

    setLoading(true);
    try {
      const result = await gameSession.logAttempt({
        roundId,
        itemId: 3,
        itemKey: '3:test:3',
        selectedIndex: 0,
        isCorrect: true,
        latencyMs: Math.floor(Math.random() * 3000) + 500,
        endRound: {
          baseScore: testScore + 1,
          mistakes: testMistakes,
          elapsedSeconds: 45,
          distinctItems: 8,
        },
      });
      addResponse('END_ROUND', 'success', result);
      setRoundId(null); // Clear round
      setTestScore(5);
      setTestMistakes(2);
    } catch (err) {
      addResponse('END_ROUND', 'error', undefined, err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 p-8">
      <div className="container max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Activity className="h-8 w-8" />
            Dev Health Check
          </h1>
          <p className="text-muted-foreground">Test edge function connectivity and database operations</p>
        </div>

        {/* Mode indicator */}
        <Alert className={`mb-6 ${isLive ? 'border-green-500 bg-green-500/10' : 'border-yellow-500 bg-yellow-500/10'}`}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {isLive ? (
              <span className="font-semibold text-green-600">✓ Live mode enabled - Testing real edge functions</span>
            ) : (
              <span>
                <span className="font-semibold text-yellow-600">Mock mode enabled</span> - Add <code className="bg-muted px-1 py-0.5 rounded">?live=1</code> to URL or toggle in header to test live functions
              </span>
            )}
          </AlertDescription>
        </Alert>

        {/* Control Panel */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Test Controls</CardTitle>
            <CardDescription>
              {roundId ? (
                <span>Active round: <code className="bg-muted px-1 py-0.5 rounded text-xs">{roundId.slice(0, 8)}...</code></span>
              ) : (
                'No active round - Start a round to begin testing'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Button
                onClick={handleStartRound}
                disabled={loading || !isLive || !!roundId}
                className="w-full"
              >
                Start Round
              </Button>
              <Button
                onClick={handleLogCorrect}
                disabled={loading || !isLive || !roundId}
                variant="outline"
                className="w-full"
              >
                Log Correct ({testScore})
              </Button>
              <Button
                onClick={handleLogWrong}
                disabled={loading || !isLive || !roundId}
                variant="outline"
                className="w-full"
              >
                Log Wrong ({testMistakes})
              </Button>
              <Button
                onClick={handleEndRound}
                disabled={loading || !isLive || !roundId}
                variant="destructive"
                className="w-full"
              >
                End Round
              </Button>
            </div>

            {loading && (
              <div className="text-center text-sm text-muted-foreground">
                Processing request...
              </div>
            )}
          </CardContent>
        </Card>

        {/* Response Log */}
        <Card>
          <CardHeader>
            <CardTitle>Response Log</CardTitle>
            <CardDescription>Last 10 responses from edge functions</CardDescription>
          </CardHeader>
          <CardContent>
            {responses.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No responses yet. Start testing to see results.
              </div>
            ) : (
              <div className="space-y-3">
                {responses.map((response, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border ${
                      response.status === 'success'
                        ? 'bg-green-500/5 border-green-500/20'
                        : 'bg-red-500/5 border-red-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {response.status === 'success' ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="font-semibold text-sm">{response.type}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(response.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    {response.error && (
                      <div className="text-sm text-red-600 mb-2">{response.error}</div>
                    )}
                    
                    {response.data && (
                      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                        {JSON.stringify(response.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DevHealth;

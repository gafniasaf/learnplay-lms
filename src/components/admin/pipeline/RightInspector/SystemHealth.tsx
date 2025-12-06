import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useJobsList } from '@/hooks/useJobsList';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Play, Loader2 } from 'lucide-react';

export function SystemHealth() {
  const { jobs } = useJobsList({ limit: 100 });
  const [triggering, setTriggering] = useState(false);

  const pendingCount = jobs.filter(j => j.status === 'pending' || j.status === 'running').length;

  const triggerJobRunner = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-job-batch-runner', {
        body: { n: 3 }
      });

      if (error) throw error;

      toast.success('Job runner triggered', {
        description: `Processed: ${data?.processedInThisBatch || 0} jobs`
      });
    } catch (error) {
      console.error('Failed to trigger job runner:', error);
      toast.error('Failed to trigger job runner', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs uppercase text-muted-foreground">System Health</CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">AI Provider</span>
          <span className="text-green-500">● Online</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Queue</span>
          <span>{pendingCount} pending</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Storage</span>
          <span className="text-green-500">● Healthy</span>
        </div>
        
        {pendingCount > 0 && (
          <Button
            onClick={triggerJobRunner}
            disabled={triggering}
            size="sm"
            variant="outline"
            className="w-full mt-2"
          >
            {triggering ? (
              <>
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                Triggering...
              </>
            ) : (
              <>
                <Play className="w-3 h-3 mr-2" />
                Process Queue
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

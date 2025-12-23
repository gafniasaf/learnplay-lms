import { useState, useEffect, useCallback, useRef } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useMCP } from '@/hooks/useMCP';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';
import { 
  AlertCircle, 
  Info, 
  AlertTriangle, 
  Bug, 
  Search, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight,
  X
} from 'lucide-react';

interface LogEntry {
  id: string;
  created_at: string;
  function_name: string;
  request_id: string | null;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata: any;
  user_id: string | null;
  job_id: string | null;
  duration_ms: number | null;
  error_code: string | null;
  stack_trace: string | null;
}

// Known edge functions to show in filter even if no logs yet
const KNOWN_FUNCTIONS = [
  'ai-job-runner',
  'generate-course',
  'game-start-round',
  'chat-course-assistant',
  'test-logging',
];

const Logs = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initRequestId = params.get('requestId') || '';
  const initJobId = params.get('jobId') || '';
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  // Filters
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [functionFilter, setFunctionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [requestIdFilter, setRequestIdFilter] = useState(initRequestId);
  const [jobIdFilter, setJobIdFilter] = useState(initJobId);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const mcp = useMCP();
  // Use ref to prevent mcp from triggering re-renders (useMCP returns new object each render)
  const mcpRef = useRef(mcp);
  mcpRef.current = mcp;
  
  // Available functions
  const [functions, setFunctions] = useState<string[]>([]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await mcpRef.current.callGet<any>('lms.list-edge-logs', { limit: "100" });
      const records = (response?.logs || response?.records || []) as LogEntry[];
      setLogs(records);
      const message = typeof response?.message === 'string' ? response.message : null;
      setNotice(message && records.length === 0 ? message : null);
      const fromLogs = records.map((log) => (log as any)?.function_name).filter(Boolean) as string[];
      const merged = Array.from(new Set([...KNOWN_FUNCTIONS, ...fromLogs]));
      setFunctions(merged);
    } catch (error) {
      console.error('Failed to load logs:', error);
      toast.error('Failed to load logs');
      setNotice('Failed to load logs (check auth / Edge connectivity).');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mcpRef is stable, toast is stable from sonner

  // Load logs
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const toggleExpand = (logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const clearFilters = () => {
    setLevelFilter('all');
    setFunctionFilter('all');
    setSearchQuery('');
    setRequestIdFilter('');
    setJobIdFilter('');
  };

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (levelFilter !== 'all' && log.level !== levelFilter) return false;
    if (functionFilter !== 'all' && log.function_name !== functionFilter) return false;
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (requestIdFilter && (log.request_id || '') !== requestIdFilter) return false;
    if (jobIdFilter && (log.job_id || '') !== jobIdFilter) return false;
    return true;
  });

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error': return <AlertCircle className="h-4 w-4" />;
      case 'warn': return <AlertTriangle className="h-4 w-4" />;
      case 'debug': return <Bug className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      case 'warn': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'debug': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <PageContainer>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">System Logs</h1>
            <p className="text-muted-foreground mt-1">Monitor edge function activity and errors</p>
          </div>
          <Button onClick={loadLogs} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            {notice && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span className="font-semibold">Heads up:</span> {notice}
                {notice.toLowerCase().includes('no logs table') && (
                  <span className="block mt-1 text-amber-800/90">
                    This page only shows logs if an <code className="px-1 bg-amber-100 rounded">edge_logs</code> table is configured and functions write into it. For course generation progress, use Jobs / AI Pipeline events.
                  </span>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="w-[260px]">
                <Input
                  placeholder="Filter by Request ID"
                  value={requestIdFilter}
                  onChange={(e) => setRequestIdFilter(e.target.value)}
                />
              </div>

              <div className="w-[240px]">
                <Input
                  placeholder="Filter by Job ID"
                  value={jobIdFilter}
                  onChange={(e) => setJobIdFilter(e.target.value)}
                />
              </div>
              
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                </SelectContent>
              </Select>

              <Select value={functionFilter} onValueChange={setFunctionFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Function" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Functions</SelectItem>
                  {functions.map(fn => (
                    <SelectItem key={fn} value={fn}>{fn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(levelFilter !== 'all' || functionFilter !== 'all' || searchQuery || requestIdFilter || jobIdFilter) && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{filteredLogs.length}</div>
              <div className="text-sm text-muted-foreground">Total Logs</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">
                {filteredLogs.filter(l => l.level === 'error').length}
              </div>
              <div className="text-sm text-muted-foreground">Errors</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">
                {filteredLogs.filter(l => l.level === 'warn').length}
              </div>
              <div className="text-sm text-muted-foreground">Warnings</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">
                {filteredLogs.filter(l => l.level === 'info').length}
              </div>
              <div className="text-sm text-muted-foreground">Info</div>
            </CardContent>
          </Card>
        </div>

        {/* Logs List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Logs</CardTitle>
            <CardDescription>Showing last 100 logs</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No logs found
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLogs.map(log => {
                  const isExpanded = expandedLogs.has(log.id);
                  return (
                    <div
                      key={log.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => toggleExpand(log.id)}
                          className="mt-1 text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`${getLevelColor(log.level)} flex items-center gap-1`}>
                              {getLevelIcon(log.level)}
                              {log.level}
                            </Badge>
                            <Badge variant="outline">{log.function_name}</Badge>
                            {log.job_id && (
                              <Badge variant="secondary" className="font-mono text-xs">
                                Job: {log.job_id.slice(0, 8)}
                              </Badge>
                            )}
                            {log.duration_ms && (
                              <Badge variant="secondary">
                                {log.duration_ms}ms
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                          
                          <p className="mt-2 text-sm">{log.message}</p>
                          
                          {isExpanded && (
                            <div className="mt-4 space-y-3 text-sm">
                              {log.request_id && (
                                <div>
                                  <span className="font-semibold">Request ID:</span>
                                  <code className="ml-2 bg-muted px-2 py-1 rounded text-xs">
                                    {log.request_id}
                                  </code>
                                </div>
                              )}
                              
                              {log.error_code && (
                                <div>
                                  <span className="font-semibold">Error Code:</span>
                                  <code className="ml-2 bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                                    {log.error_code}
                                  </code>
                                </div>
                              )}
                              
                              {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <div>
                                  <span className="font-semibold">Metadata:</span>
                                  <pre className="mt-1 bg-muted p-2 rounded text-xs overflow-x-auto">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                              
                              {log.stack_trace && (
                                <div>
                                  <span className="font-semibold">Stack Trace:</span>
                                  <pre className="mt-1 bg-red-50 p-2 rounded text-xs overflow-x-auto border border-red-200">
                                    {log.stack_trace}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
};

export default Logs;

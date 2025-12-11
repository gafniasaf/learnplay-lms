import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMCP } from '@/hooks/useMCP';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PageContainer } from '@/components/layout/PageContainer';

export default function TeacherAnalytics() {
  const mcp = useMCP();
  const [range, setRange] = useState<'7d'|'30d'|'90d'>('7d');
  const { data: catalogData, isLoading: loadingCatalog } = useQuery({ 
    queryKey: ['catalog'], 
    queryFn: () => mcp.getCourseCatalog(), 
    staleTime: 5 * 60_000 
  });
  const catalog = (catalogData as { courses?: Array<{ id: string; title?: string }> })?.courses ?? [];
  const [courseId, setCourseId] = useState<string>('');
  
  useEffect(() => { 
    if (!courseId && catalog.length) setCourseId(catalog[0].id); 
  }, [catalog, courseId]);

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', courseId, range],
    queryFn: () => courseId ? mcp.fetchAnalytics(courseId, range) : Promise.resolve(null),
    enabled: !!courseId
  });

  const chartData = useMemo(() => (data?.analytics ?? []).map(d => ({
    date: d.date, 
    submissions: d.submissions_count, 
    avg: d.average_grade ?? 0
  })), [data]);

  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold">Teacher Analytics</h1>
          <select 
            className="border rounded p-2 bg-background" 
            value={courseId} 
            onChange={e => setCourseId(e.target.value)} 
            disabled={loadingCatalog || !catalog.length}
          >
            {catalog.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <div className="inline-flex border rounded overflow-hidden">
            {(['7d','30d','90d'] as const).map(r => (
              <button 
                key={r} 
                className={`px-3 py-1 transition-colors ${range===r?'bg-muted':'hover:bg-muted/50'}`} 
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              Loading analytics...
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Stat label="Students" value={data?.summary.totalStudents ?? 0} />
              <Stat label="Assignments" value={data?.summary.totalAssignments ?? 0} />
              <Stat label="Avg Grade" value={`${data?.summary.averageGrade ?? 0}%`} />
              <Stat label="Submissions" value={data?.summary.totalSubmissions ?? 0} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="Submissions over time">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <YAxis className="text-muted-foreground" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="submissions" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              <Card title="Average grade over time">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <YAxis domain={[0, 100]} className="text-muted-foreground" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="avg" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="font-medium mb-3">{title}</div>
      {children}
    </div>
  );
}

// Simple in-memory metrics store for now
// In production, this could be backed by a database or external service
const metricsStore = {
  data: [] as any[],
  summary() {
    const total = this.data.length;
    const byStatus = this.data.reduce((acc: any, m: any) => {
      const status = m.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    return { total, byStatus };
  },
  recent(limit: number) {
    return this.data.slice(-limit);
  },
  reset() {
    this.data = [];
  },
};

export async function metricsSummary() {
  const data = metricsStore.summary();
  return { ok: true, ...data };
}

export async function metricsRecent({ params }: { params: { limit?: number } }) {
  const limit = Math.min(Math.max(+(params?.limit ?? 200), 1), 1000);
  const data = metricsStore.recent(limit);
  return { ok: true, data };
}

export async function metricsReset() {
  metricsStore.reset();
  return { ok: true };
}



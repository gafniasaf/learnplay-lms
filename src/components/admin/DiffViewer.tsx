import { Button } from '@/components/ui/button';

type PatchOp = { op: string; path: string; value?: unknown };

interface DiffViewerProps {
  diff: PatchOp[];
  onApprove: () => void;
  onCancel: () => void;
  title?: string;
}

export const DiffViewer = ({ diff, onApprove, onCancel, title = 'Proposed Changes' }: DiffViewerProps) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm max-w-3xl w-full">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <div className="flex gap-2">
          <Button size="sm" onClick={onApprove}>Approve</Button>
          <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
      <div className="p-4 max-h-[60vh] overflow-auto text-sm">
        {diff.length === 0 ? (
          <div className="text-muted-foreground">No changes</div>
        ) : (
          <ul className="space-y-2">
            {diff.map((op, i) => (
              <li key={i} className="font-mono bg-gray-50 border border-gray-200 rounded px-3 py-2">
                <span className="mr-2 text-xs uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-700">{op.op}</span>
                <span className="text-gray-700">{op.path}</span>
                {'value' in op && op.value !== undefined && (
                  <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap">{JSON.stringify(op.value, null, 2)}</pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};



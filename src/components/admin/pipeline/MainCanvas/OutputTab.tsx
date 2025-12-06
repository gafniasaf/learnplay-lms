import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function OutputTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Generated Course Output</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Course JSON will be displayed here once generation is complete.
        </p>
        <div className="flex gap-2">
          <Button variant="outline">Download JSON</Button>
          <Button variant="outline">Deploy to Catalog</Button>
          <Button variant="outline">Edit in Course Studio</Button>
        </div>
      </CardContent>
    </Card>
  );
}

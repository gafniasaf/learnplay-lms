import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function PromptsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompt Templates</CardTitle>
        <CardDescription>
          View and edit the prompts used for AI course generation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-gray-900 text-gray-300 p-4 rounded-lg font-mono text-sm">
          <pre className="whitespace-pre-wrap">
{`Generate a complete educational course in JSON format following Course v2 schema.

Requirements:
- Subject: {{subject}}
- Grade Level: {{grade}}
- Items per group: {{itemsPerGroup}}
- Mode: {{mode}}

Course Structure:
1. Create 3-5 groups covering different aspects of the subject
2. Each group should have exactly {{itemsPerGroup}} items
3. Each item must have exactly 1 placeholder ([blank])
4. For options mode: 3-4 options with correctIndex
5. For numeric mode: answer field (no options)
6. Include clusterId and variant (1/2/3) for adaptive rotation
7. Create 2-4 study texts (reference materials) teaching the concepts

Schema Requirements (CRITICAL - FOLLOW EXACTLY):
- id (course): kebab-case string (e.g., "subject-name")
- title: string (descriptive course name, REQUIRED)
- contentVersion: string timestamp
- groups: array of objects with id, name, optional color
- items: array with id, text (with [blank]), groupId, mode, etc.
- levels: array covering all items with start/end indices`}
          </pre>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          💡 Prompt editing will be available in a future release
        </p>
      </CardContent>
    </Card>
  );
}

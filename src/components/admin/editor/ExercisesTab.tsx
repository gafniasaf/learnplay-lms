import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Sparkles } from 'lucide-react';
import { generateExercises, type GeneratedItem } from '@/lib/api/aiRewrites';
import { toast } from 'sonner';

interface ExercisesTabProps {
  courseId: string;
  onAdopt: (items: GeneratedItem[]) => void;
}

export const ExercisesTab = ({ courseId, onAdopt }: ExercisesTabProps) => {
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [modes, setModes] = useState<Array<'options' | 'numeric'>>(['options', 'numeric']);
  const [topics, setTopics] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedItems, setGeneratedItems] = useState<GeneratedItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  const handleGenerate = async () => {
    if (count < 1 || count > 20) {
      toast.error('Count must be between 1 and 20');
      return;
    }

    try {
      setLoading(true);
      const response = await generateExercises({
        courseId,
        count,
        modes,
        difficulty,
        topics: topics.split(',').map(t => t.trim()).filter(Boolean),
      });

      setGeneratedItems(response.items);
      // Select all by default
      setSelectedItems(new Set(response.items.map((_, i) => i)));
      toast.success(`Generated ${response.items.length} exercises`);
    } catch (error) {
      console.error('Generation failed:', error);
      toast.error('Failed to generate exercises');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMode = (mode: 'options' | 'numeric') => {
    if (modes.includes(mode)) {
      if (modes.length > 1) {
        setModes(modes.filter(m => m !== mode));
      }
    } else {
      setModes([...modes, mode]);
    }
  };

  const handleToggleItem = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const handleAdoptSelected = () => {
    const itemsToAdopt = generatedItems.filter((_, i) => selectedItems.has(i));
    onAdopt(itemsToAdopt);
    setGeneratedItems([]);
    setSelectedItems(new Set());
    toast.success(`Adopted ${itemsToAdopt.length} exercises`);
  };

  return (
    <div className="space-y-6">
      {/* Generation Form */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
        <h3 className="text-sm font-semibold">Generate New Exercises</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="count">Count</Label>
            <Input
              id="count"
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            />
          </div>

          <div>
            <Label htmlFor="difficulty">Difficulty</Label>
            <Select value={difficulty} onValueChange={(v: any) => setDifficulty(v)}>
              <SelectTrigger id="difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Modes</Label>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="mode-options"
                checked={modes.includes('options')}
                onCheckedChange={() => handleToggleMode('options')}
              />
              <label htmlFor="mode-options" className="text-sm">Options</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="mode-numeric"
                checked={modes.includes('numeric')}
                onCheckedChange={() => handleToggleMode('numeric')}
              />
              <label htmlFor="mode-numeric" className="text-sm">Numeric</label>
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="topics">Topics (comma-separated)</Label>
          <Input
            id="topics"
            placeholder="e.g., 24-hour format, analog clocks"
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
          />
        </div>

        <Button onClick={handleGenerate} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate {count} Exercise{count !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      </div>

      {/* Preview Table */}
      {generatedItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Generated Exercises ({generatedItems.length})</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedItems(new Set(generatedItems.map((_, i) => i)))}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedItems(new Set())}>
                Deselect All
              </Button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              {generatedItems.map((item, index) => (
                <div
                  key={index}
                  className={`
                    p-4 border-b border-gray-200 last:border-b-0 cursor-pointer transition-colors
                    ${selectedItems.has(index) ? 'bg-primary/5' : 'hover:bg-gray-50'}
                  `}
                  onClick={() => handleToggleItem(index)}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedItems.has(index)}
                      onCheckedChange={() => handleToggleItem(index)}
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm mb-1">{item.stem.text}</div>
                      <div className="text-xs text-muted-foreground">
                        Mode: {item.mode} • Difficulty: {item.difficulty}
                      </div>
                      {item.options && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Options: {item.options.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={handleAdoptSelected}
            disabled={selectedItems.size === 0}
            className="w-full"
          >
            Adopt Selected ({selectedItems.size})
          </Button>
        </div>
      )}
    </div>
  );
};


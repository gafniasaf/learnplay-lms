import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Zap, DollarSign, Clock, Star, AlertTriangle } from 'lucide-react';

interface Provider {
  id: string;
  name: string;
  cost: number;
  time: number;
  quality: number;
  description: string;
}

const providers: Provider[] = [
  {
    id: 'openai-dalle3',
    name: 'DALL-E 3',
    cost: 0.04,
    time: 45,
    quality: 5,
    description: 'Best for educational content - highest accuracy and detail',
  },
  {
    id: 'openai-dalle3-hd',
    name: 'DALL-E 3 HD',
    cost: 0.08,
    time: 50,
    quality: 5,
    description: 'Ultra-high quality - best for final production',
  },
  {
    id: 'replicate-sdxl',
    name: 'Stable Diffusion XL',
    cost: 0.01,
    time: 15,
    quality: 4,
    description: 'Fast and cost-effective - great for prototyping',
  },
];

const styles = [
  { value: 'diagram', label: 'Medical Diagram', description: 'Precise anatomical illustration' },
  { value: 'photo', label: 'Realistic Photo', description: 'Photorealistic rendering' },
  { value: 'illustration', label: 'Simplified Illustration', description: 'Clean, educational style' },
  { value: '3d', label: '3D Render', description: '3D modeled appearance' },
  { value: 'infographic', label: 'Infographic', description: 'Data visualization style' },
];

interface RegenerationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId?: string;
  currentProvider?: string;
  currentPrompt?: string;
  mediaType?: 'image' | 'audio' | 'video';
  onRegenerate?: (params: {
    assetId: string;
    provider: string;
    style?: string;
    customPrompt?: string;
  }) => Promise<void>;
}

export function RegenerationModal({
  open,
  onOpenChange,
  assetId,
  currentProvider = 'openai-dalle3',
  currentPrompt = '',
  mediaType = 'image',
  onRegenerate,
}: RegenerationModalProps) {
  const [selectedProvider, setSelectedProvider] = useState(currentProvider);
  const [selectedStyle, setSelectedStyle] = useState('diagram');
  const [customPrompt, setCustomPrompt] = useState('');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const selectedProviderData = providers.find(p => p.id === selectedProvider);

  const handleRegenerate = async () => {
    if (!assetId) return;

    setIsRegenerating(true);
    try {
      await onRegenerate?.({
        assetId,
        provider: selectedProvider,
        style: selectedStyle,
        customPrompt: useCustomPrompt ? customPrompt : undefined,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Regeneration failed:', error);
    } finally {
      setIsRegenerating(false);
    }
  };

  const costDifference = selectedProviderData 
    ? selectedProviderData.cost - (providers.find(p => p.id === currentProvider)?.cost || 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regenerate Media</DialogTitle>
          <DialogDescription>
            Choose a provider and style to regenerate this {mediaType}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Asset Info */}
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current Provider:</span>
              <Badge variant="outline">{currentProvider}</Badge>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Current Prompt:</span>
              <p className="mt-1 text-foreground">{currentPrompt}</p>
            </div>
          </div>

          {/* Provider Selection */}
          <div className="space-y-3">
            <Label>Select Provider</Label>
            <RadioGroup value={selectedProvider} onValueChange={setSelectedProvider}>
              {providers.map((provider) => {
                const isRecommended = provider.id === 'openai-dalle3';
                const isCheapest = provider.cost === Math.min(...providers.map(p => p.cost));
                const isFastest = provider.time === Math.min(...providers.map(p => p.time));

                return (
                  <div
                    key={provider.id}
                    className={`flex items-start space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedProvider === provider.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedProvider(provider.id)}
                  >
                    <RadioGroupItem value={provider.id} id={provider.id} className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Label htmlFor={provider.id} className="font-semibold cursor-pointer">
                          {provider.name}
                        </Label>
                        {isRecommended && (
                          <Badge variant="default" className="text-xs">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Recommended
                          </Badge>
                        )}
                        {isCheapest && (
                          <Badge variant="secondary" className="text-xs">
                            <DollarSign className="h-3 w-3 mr-1" />
                            Cheapest
                          </Badge>
                        )}
                        {isFastest && (
                          <Badge variant="secondary" className="text-xs">
                            <Zap className="h-3 w-3 mr-1" />
                            Fastest
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{provider.description}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          <span>${provider.cost.toFixed(4)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>~{provider.time}s</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-current text-yellow-500" />
                          <span>{provider.quality}/5</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          {/* Style Selection (for images) */}
          {mediaType === 'image' && (
            <div className="space-y-3">
              <Label>Generation Style</Label>
              <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {styles.map((style) => (
                    <SelectItem key={style.value} value={style.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{style.label}</span>
                        <span className="text-xs text-muted-foreground">{style.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Custom Prompt */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Custom Prompt (Optional)</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setUseCustomPrompt(!useCustomPrompt);
                  if (!useCustomPrompt) {
                    setCustomPrompt(currentPrompt);
                  }
                }}
              >
                {useCustomPrompt ? 'Use Original' : 'Customize'}
              </Button>
            </div>
            {useCustomPrompt && (
              <Textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Enter a custom prompt to modify the generation..."
                rows={4}
              />
            )}
          </div>

          {/* Cost Comparison */}
          {selectedProviderData && (
            <Alert>
              <AlertDescription className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-medium">Generation Cost</div>
                  <div className="text-sm text-muted-foreground">
                    ${selectedProviderData.cost.toFixed(4)} • Est. time: ~{selectedProviderData.time}s
                  </div>
                </div>
                {costDifference !== 0 && (
                  <Badge variant={costDifference > 0 ? 'destructive' : 'default'}>
                    {costDifference > 0 ? '+' : ''}${Math.abs(costDifference).toFixed(4)}
                  </Badge>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Warning if changing provider */}
          {selectedProvider !== currentProvider && (
            <Alert variant="default">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Changing providers may result in different visual style and output quality.
                The new version will be saved with version number @v{2}.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRegenerating}>
            Cancel
          </Button>
          <Button onClick={handleRegenerate} disabled={isRegenerating || !assetId}>
            {isRegenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Regenerate (${selectedProviderData?.cost.toFixed(4)})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


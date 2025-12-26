/**
 * Import Legacy Course Page
 * 
 * Allows importing courses from the legacy MES system into IgniteZero.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Upload, CheckCircle2, XCircle, Loader2, Database, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { callEdgeFunction } from '@/lib/api/common';

interface ImportStatus {
  phase: 'idle' | 'fetching' | 'migrating_images' | 'transforming' | 'saving' | 'complete' | 'error';
  progress: number;
  message: string;
  courseId?: string;
  stats?: {
    itemsImported: number;
    studyTextsImported: number;
    imagesMigrated: number;
    imagesFailedCount: number;
  };
  errors: string[];
}

const ImportLegacyCourse = () => {
  const navigate = useNavigate();
  
  const [legacyCourseId, setLegacyCourseId] = useState('');
  const [migrateImages, setMigrateImages] = useState(true);
  const [locale, setLocale] = useState('he');
  const [status, setStatus] = useState<ImportStatus>({
    phase: 'idle',
    progress: 0,
    message: '',
    errors: [],
  });

  const handleImport = async () => {
    const courseId = parseInt(legacyCourseId, 10);
    if (isNaN(courseId) || courseId <= 0) {
      toast.error('Please enter a valid course ID');
      return;
    }

    setStatus({
      phase: 'fetching',
      progress: 10,
      message: 'Fetching course from legacy database...',
      errors: [],
    });

    try {
      // Call the import Edge Function
      const result = await callEdgeFunction<
        { courseId: number; migrateImages: boolean; locale: string },
        {
          success: boolean;
          courseId?: string;
          error?: string;
          stats?: {
            itemsImported: number;
            studyTextsImported: number;
            imagesMigrated: number;
            imagesFailedCount: number;
          };
          warnings?: string[];
        }
      >('import-legacy-course', {
        courseId,
        migrateImages,
        locale,
      });

      if (!result.success) {
        throw new Error(result.error || 'Import failed');
      }

      setStatus({
        phase: 'complete',
        progress: 100,
        message: 'Import complete!',
        courseId: result.courseId,
        stats: result.stats,
        errors: result.warnings || [],
      });

      toast.success(`Course imported successfully! ID: ${result.courseId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      setStatus({
        phase: 'error',
        progress: 0,
        message,
        errors: [message],
      });
      toast.error(message);
    }
  };

  const openImportedCourse = () => {
    if (status.courseId) {
      navigate(`/admin/courses/${status.courseId}/edit`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/courses/select')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Import Legacy Course</h1>
            <p className="text-gray-600">Import courses from the MES legacy system</p>
          </div>
        </div>

        {/* Import Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Legacy Course Details
            </CardTitle>
            <CardDescription>
              Enter the course ID from the legacy MES system to import
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="courseId">Legacy Course ID</Label>
              <Input
                id="courseId"
                type="number"
                placeholder="e.g., 169"
                value={legacyCourseId}
                onChange={(e) => setLegacyCourseId(e.target.value)}
                disabled={status.phase !== 'idle' && status.phase !== 'complete' && status.phase !== 'error'}
              />
              <p className="text-xs text-gray-500">
                Find this in the legacy system's course management
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locale">Target Language</Label>
              <select
                id="locale"
                className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                disabled={status.phase !== 'idle' && status.phase !== 'complete' && status.phase !== 'error'}
              >
                <option value="he">Hebrew (עברית)</option>
                <option value="en">English</option>
                <option value="ar">Arabic (العربية)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="migrateImages"
                checked={migrateImages}
                onChange={(e) => setMigrateImages(e.target.checked)}
                disabled={status.phase !== 'idle' && status.phase !== 'complete' && status.phase !== 'error'}
                className="h-4 w-4"
              />
              <Label htmlFor="migrateImages" className="flex items-center gap-2 cursor-pointer">
                <ImageIcon className="h-4 w-4" />
                Migrate images to Supabase Storage
              </Label>
            </div>

            <Button
              onClick={handleImport}
              disabled={!legacyCourseId || (status.phase !== 'idle' && status.phase !== 'complete' && status.phase !== 'error')}
              className="w-full"
            >
              {status.phase !== 'idle' && status.phase !== 'complete' && status.phase !== 'error' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Course
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Progress */}
        {status.phase !== 'idle' && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{status.message}</span>
                  <span className="text-sm text-gray-500">{status.progress}%</span>
                </div>
                <Progress value={status.progress} />

                {status.phase === 'complete' && status.stats && (
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-700">{status.stats.itemsImported}</div>
                      <div className="text-xs text-green-600">Exercises</div>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-700">{status.stats.studyTextsImported}</div>
                      <div className="text-xs text-blue-600">Study Texts</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-700">{status.stats.imagesMigrated}</div>
                      <div className="text-xs text-purple-600">Images Migrated</div>
                    </div>
                    {status.stats.imagesFailedCount > 0 && (
                      <div className="text-center p-3 bg-amber-50 rounded-lg">
                        <div className="text-2xl font-bold text-amber-700">{status.stats.imagesFailedCount}</div>
                        <div className="text-xs text-amber-600">Images Failed</div>
                      </div>
                    )}
                  </div>
                )}

                {status.phase === 'complete' && (
                  <div className="flex items-center gap-2 pt-4">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-green-700 font-medium">Course imported successfully!</span>
                  </div>
                )}

                {status.phase === 'error' && (
                  <div className="flex items-center gap-2 pt-4">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="text-red-700 font-medium">Import failed</span>
                  </div>
                )}

                {status.errors.length > 0 && (
                  <Alert variant={status.phase === 'error' ? 'destructive' : 'default'}>
                    <AlertDescription>
                      <ul className="list-disc pl-4 space-y-1">
                        {status.errors.map((err, i) => (
                          <li key={i} className="text-sm">{err}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {status.phase === 'complete' && status.courseId && (
                  <Button onClick={openImportedCourse} className="w-full mt-4">
                    Open in Course Editor
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info */}
        <Alert>
          <AlertDescription className="text-sm">
            <strong>What gets imported:</strong>
            <ul className="list-disc pl-4 mt-2 space-y-1">
              <li>Course metadata and structure</li>
              <li>Topics → Groups (with hierarchy)</li>
              <li>Exercises → Items (questions & answers)</li>
              <li>Subjects → Study Texts (educational content)</li>
              <li>Images (optionally migrated to Supabase Storage)</li>
            </ul>
            <p className="mt-3">
              <strong>Note:</strong> Explanations for exercises will need to be generated using 
              the AI Generate feature in the Course Editor.
            </p>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
};

export default ImportLegacyCourse;


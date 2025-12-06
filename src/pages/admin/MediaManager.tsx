/**
 * MediaManager - IgniteZero compliant
 * Uses edge functions for storage operations
 */
import { useState, useEffect } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { FolderOpen, Upload, Trash2, Copy, RefreshCw, Image as ImageIcon, Music, Video, File, CheckCircle2, AlertCircle, LogIn, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  listMediaFolders, 
  listMediaFiles, 
  deleteMediaFile, 
  uploadMediaFile,
  MediaFile 
} from "@/lib/api/media";
import { getRole } from "@/lib/roles";

interface FileItem {
  name: string;
  path: string;
  size: number;
  created_at: string;
  updated_at?: string;
  type: 'image' | 'audio' | 'video' | 'other';
  publicUrl: string;
}

const getFileType = (filename: string): 'image' | 'audio' | 'video' | 'other' => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext || '')) return 'image';
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext || '')) return 'audio';
  if (['mp4', 'webm', 'mov'].includes(ext || '')) return 'video';
  return 'other';
};

const formatFileSize = (bytes: number): string => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const MediaManager = () => {
  // Auth state - use role system
  const isAdmin = getRole() === 'admin';

  // Courses state
  const [availableCourses, setAvailableCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  // Files state
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'audio' | 'video'>('all');

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<'image' | 'audio' | 'video'>('image');

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);

  // Load courses on mount
  useEffect(() => {
    if (isAdmin) {
      loadCourses();
    }
  }, [isAdmin]);

  // Load files when course is selected
  useEffect(() => {
    if (selectedCourseId) {
      loadFiles();
    }
  }, [selectedCourseId]);

  const loadCourses = async () => {
    try {
      const response = await listMediaFolders("courses");
      if (response.ok) {
        setAvailableCourses(
          response.folders.map(folder => ({
            id: folder,
            title: folder,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load courses:", err);
      toast.error("Failed to load courses");
    }
  };

  const loadFiles = async () => {
    if (!selectedCourseId) return;

    setLoading(true);
    try {
      const folders = ['images', 'audio', 'video'];
      const allFiles: FileItem[] = [];

      for (const folder of folders) {
        const path = `${selectedCourseId}/assets/${folder}`;
        
        try {
          const response = await listMediaFiles(path, "courses");
          
          if (response.ok && response.files) {
            const filesWithTypes = response.files.map(file => ({
              name: file.name,
              path: file.path,
              size: file.size || 0,
              created_at: file.created_at || '',
              updated_at: file.created_at || '',
              type: getFileType(file.name),
              publicUrl: file.public_url || '',
            }));

            allFiles.push(...filesWithTypes);
          }
        } catch (err) {
          // Folder might not exist, skip
          console.warn(`Folder ${path} not found:`, err);
        }
      }

      setFiles(allFiles);
    } catch (err) {
      console.error("Failed to load files:", err);
      toast.error("Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedCourseId) return;

    setUploading(true);
    try {
      // Generate UUID filename
      const uuid = crypto.randomUUID();
      const extension = file.name.split('.').pop() || '';
      const filename = `${uuid}.${extension}`;

      const folder = uploadType === 'image' ? 'images' : uploadType === 'audio' ? 'audio' : 'video';
      const path = `${selectedCourseId}/assets/${folder}/${filename}`;

      const result = await uploadMediaFile(path, file, "courses");

      if (result.ok) {
        toast.success("File uploaded successfully");
        loadFiles(); // Reload file list
      } else {
        throw new Error("Upload failed");
      }
    } catch (err) {
      console.error("Upload error:", err);
      toast.error(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copied to clipboard");
    } catch (err) {
      console.error("Failed to copy:", err);
      toast.error("Failed to copy URL");
    }
  };

  const handleDeleteFile = async () => {
    if (!fileToDelete) return;

    try {
      const result = await deleteMediaFile(fileToDelete.path, "courses");

      if (result.ok) {
        toast.success("File deleted successfully");
        loadFiles(); // Reload file list
      } else {
        throw new Error("Delete failed");
      }
    } catch (err) {
      console.error("Delete error:", err);
      toast.error(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image': return ImageIcon;
      case 'audio': return Music;
      case 'video': return Video;
      default: return File;
    }
  };

  const filteredFiles = filterType === 'all' 
    ? files 
    : files.filter(f => f.type === filterType);

  if (!isAdmin) {
    return (
      <PageContainer>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogIn className="h-5 w-5" />
              Admin Access Required
            </CardTitle>
            <CardDescription>
              You must be signed in as an admin to use Media Manager
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <p className="text-muted-foreground mb-4">
              Please sign in with an admin account to continue.
            </p>
            <Button onClick={() => window.location.href = "/admin"} data-cta-id="go-to-admin">
              Go to Admin Dashboard
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20">
            <FolderOpen className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-4xl font-bold">Media Manager</h1>
            <p className="text-muted-foreground">Browse and manage course assets</p>
          </div>
        </div>

        {/* Course Selector & Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Select Course</CardTitle>
            <CardDescription>Choose a course to browse its media files</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="course">Course</Label>
                <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                  <SelectTrigger id="course">
                    <SelectValue placeholder="Select a course..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCourses.map(course => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedCourseId && (
                <div className="flex items-end gap-2">
                  <Button onClick={loadFiles} disabled={loading} variant="outline" data-cta-id="refresh-files">
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              )}
            </div>

            {selectedCourseId && (
              <Alert>
                <FolderOpen className="h-4 w-4" />
                <AlertDescription>
                  Browsing: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                    courses/{selectedCourseId}/assets/**
                  </code>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Upload Section */}
        {selectedCourseId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload File
              </CardTitle>
              <CardDescription>
                Upload images, audio, or video files to this course
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={uploadType} onValueChange={(v) => setUploadType(v as 'image' | 'audio' | 'video')}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="image">
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Image
                  </TabsTrigger>
                  <TabsTrigger value="audio">
                    <Music className="h-4 w-4 mr-2" />
                    Audio
                  </TabsTrigger>
                  <TabsTrigger value="video">
                    <Video className="h-4 w-4 mr-2" />
                    Video
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="image" className="space-y-4">
                  <Alert>
                    <AlertDescription className="text-xs">
                      Upload images (WebP, PNG, JPG) up to 2MB
                    </AlertDescription>
                  </Alert>
                  <Input
                    type="file"
                    accept=".webp,.png,.jpg,.jpeg"
                    disabled={uploading}
                    onChange={handleFileUpload}
                  />
                </TabsContent>

                <TabsContent value="audio" className="space-y-4">
                  <Alert>
                    <AlertDescription className="text-xs">
                      Upload audio (MP3, WAV) up to 5MB
                    </AlertDescription>
                  </Alert>
                  <Input
                    type="file"
                    accept=".mp3,.wav,.m4a,.ogg"
                    disabled={uploading}
                    onChange={handleFileUpload}
                  />
                </TabsContent>

                <TabsContent value="video" className="space-y-4">
                  <Alert>
                    <AlertDescription className="text-xs">
                      Upload video (MP4, WebM) up to 15MB
                    </AlertDescription>
                  </Alert>
                  <Input
                    type="file"
                    accept=".mp4,.webm,.mov"
                    disabled={uploading}
                    onChange={handleFileUpload}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Files List */}
        {selectedCourseId && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Files</CardTitle>
                  <CardDescription>
                    {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''} found
                  </CardDescription>
                </div>
                <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="image">Images</SelectItem>
                    <SelectItem value="audio">Audio</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Loading files...</p>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="text-center py-12">
                  <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No files found</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {filteredFiles.map((file) => {
                      const Icon = getFileIcon(file.type);
                      return (
                        <div
                          key={file.path}
                          className="flex items-center gap-3 p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                        >
                          <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-mono text-sm truncate">{file.name}</p>
                              <Badge variant="secondary" className="text-xs">
                                {file.type}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(file.size)} • {file.created_at ? new Date(file.created_at).toLocaleDateString() : 'N/A'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyUrl(file.publicUrl)}
                              data-cta-id="copy-url"
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy URL
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setFileToDelete(file);
                                setDeleteDialogOpen(true);
                              }}
                              data-cta-id="delete-file"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete File</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this file? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {fileToDelete && (
              <div className="bg-muted p-3 rounded-lg">
                <p className="font-mono text-sm">{fileToDelete.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatFileSize(fileToDelete.size)}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteFile} data-cta-id="confirm-delete">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  );
};

export default MediaManager;

import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Video, Trash2, Calendar, HardDrive, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Videos() {
  const { user, loading: authLoading } = useAuth();
  const [deleteVideoId, setDeleteVideoId] = useState<number | null>(null);
  const [playingVideo, setPlayingVideo] = useState<number | null>(null);

  const { data: videos, isLoading, refetch } = trpc.videos.list.useQuery(
    { limit: 50 },
    { enabled: !!user }
  );

  const deleteMutation = trpc.videos.delete.useMutation({
    onSuccess: () => {
      toast.success('Video deleted successfully');
      refetch();
      setDeleteVideoId(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete video: ${error.message}`);
    },
  });

  const handleDelete = (videoId: number) => {
    deleteMutation.mutate({ videoId });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please sign in to view motion videos</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href="/auth/google">Sign In with Google</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <Button asChild variant="ghost" className="mb-4">
            <Link href="/devices">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Devices
            </Link>
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Video className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Motion Videos</h1>
              <p className="text-gray-600">
                5-second clips captured when motion is detected
              </p>
            </div>
          </div>
        </div>

        {/* Videos Grid */}
        {!videos || videos.length === 0 ? (
          <Alert>
            <Video className="h-4 w-4" />
            <AlertDescription>
              No motion videos yet. Videos will appear here when motion is detected by your birdhouse cameras.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((video) => (
              <Card key={video.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    {video.deviceName}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <Calendar className="h-3 w-3" />
                    {formatDate(video.capturedAt)}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  {/* Video Player */}
                  <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
                    {playingVideo === video.id ? (
                      <video
                        className="w-full h-full object-contain"
                        controls
                        autoPlay
                        src={`/api/videos/${video.id}`}
                        onError={() => {
                          toast.error('Failed to load video');
                          setPlayingVideo(null);
                        }}
                      >
                        Your browser does not support the video tag.
                      </video>
                    ) : (
                      <div 
                        className="absolute inset-0 flex items-center justify-center cursor-pointer hover:bg-gray-800/50 transition-colors"
                        onClick={() => setPlayingVideo(video.id)}
                      >
                        <div className="bg-white/90 rounded-full p-4 hover:bg-white transition-colors">
                          <Video className="h-8 w-8 text-gray-900" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Video Info */}
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3" />
                      {formatFileSize(video.filesize)}
                    </div>
                    <div>{video.duration}s</div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setPlayingVideo(playingVideo === video.id ? null : video.id)}
                    >
                      {playingVideo === video.id ? 'Close' : 'Play'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteVideoId(video.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteVideoId !== null} onOpenChange={() => setDeleteVideoId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Video?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The video file will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteVideoId && handleDelete(deleteVideoId)}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

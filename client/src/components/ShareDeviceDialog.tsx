import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Share2, Trash2, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ShareDeviceDialogProps {
  deviceId: number;
  deviceName: string;
  isOwner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDeviceDialog({
  deviceId,
  deviceName,
  isOwner,
  open,
  onOpenChange,
}: ShareDeviceDialogProps) {
  const [email, setEmail] = useState('');

  const { data: sharedUsers, refetch: refetchSharedUsers } = trpc.sharing.getSharedUsers.useQuery(
    { deviceId },
    { enabled: open && isOwner }
  );

  const shareMutation = trpc.sharing.shareDevice.useMutation({
    onSuccess: (data) => {
      toast.success(`Device shared with ${data.sharedWith}`);
      setEmail('');
      refetchSharedUsers();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to share device');
    },
  });

  const unshareMutation = trpc.sharing.unshareDevice.useMutation({
    onSuccess: () => {
      toast.success('Device access removed');
      refetchSharedUsers();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to remove access');
    },
  });

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    shareMutation.mutate({ deviceId, email: email.trim() });
  };

  const handleUnshare = (userId: number, userName: string | null) => {
    if (confirm(`Remove access for ${userName || 'this user'}?`)) {
      unshareMutation.mutate({ deviceId, userId });
    }
  };

  if (!isOwner) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shared Device</DialogTitle>
            <DialogDescription>
              This device is shared with you. Only the owner can manage sharing settings.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg">
            <User className="h-5 w-5 text-blue-600" />
            <span className="text-sm text-blue-900">You have viewer access to this device</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Share Device</DialogTitle>
          <DialogDescription>
            Share <strong>{deviceName}</strong> with other users by entering their email address.
            They must have signed in at least once.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleShare} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="flex gap-2">
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={shareMutation.isPending}
              />
              <Button type="submit" disabled={shareMutation.isPending}>
                {shareMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sharing...
                  </>
                ) : (
                  <>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        {sharedUsers && sharedUsers.length > 0 && (
          <div className="space-y-2">
            <Label>Shared With</Label>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {sharedUsers.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-gray-500" />
                    <div>
                      <div className="font-medium text-sm">{share.userName || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{share.userEmail}</div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {share.role}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnshare(share.userId, share.userName)}
                    disabled={unshareMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {sharedUsers && sharedUsers.length === 0 && (
          <div className="text-center py-4 text-sm text-gray-500">
            This device is not shared with anyone yet.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2, Camera, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
// Google OAuth is used for authentication
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function Devices() {
  const { user, loading: authLoading } = useAuth();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newDevice, setNewDevice] = useState({
    deviceId: '',
    name: '',
    description: '',
  });

  const { data: devices, isLoading, refetch } = trpc.devices.list.useQuery(undefined, {
    enabled: !!user,
  });

  const createDeviceMutation = trpc.devices.create.useMutation({
    onSuccess: () => {
      toast.success('Device added successfully');
      setIsAddDialogOpen(false);
      setNewDevice({ deviceId: '', name: '', description: '' });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add device');
    },
  });

  const deleteDeviceMutation = trpc.devices.delete.useMutation({
    onSuccess: () => {
      toast.success('Device removed successfully');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to remove device');
    },
  });

  const handleAddDevice = async () => {
    if (!newDevice.deviceId || !newDevice.name) {
      toast.error('Please fill in all required fields');
      return;
    }

    createDeviceMutation.mutate(newDevice);
  };

  const handleDeleteDevice = async (id: number, name: string) => {
    if (confirm(`Are you sure you want to remove "${name}"?`)) {
      deleteDeviceMutation.mutate({ id });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please sign in to manage your devices</CardDescription>
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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="container max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">My Devices</h1>
            <p className="text-gray-600 mt-1">Manage your birdhouse cameras</p>
          </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Device
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Device</DialogTitle>
                <DialogDescription>
                  Register a new ESP32-CAM birdhouse device
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="deviceId">Device ID *</Label>
                  <Input
                    id="deviceId"
                    placeholder="e.g., birdhouse-001"
                    value={newDevice.deviceId}
                    onChange={(e) => setNewDevice({ ...newDevice, deviceId: e.target.value })}
                  />
                  <p className="text-sm text-gray-500">
                    Unique identifier programmed into your ESP32-CAM
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Front Yard Birdhouse"
                    value={newDevice.name}
                    onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Optional notes about this device..."
                    value={newDevice.description}
                    onChange={(e) => setNewDevice({ ...newDevice, description: e.target.value })}
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddDevice}
                  disabled={createDeviceMutation.isPending}
                >
                  {createDeviceMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add Device'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : devices && devices.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {devices.map((device) => (
              <Card key={device.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="h-5 w-5" />
                    {device.name}
                  </CardTitle>
                  <CardDescription>
                    ID: {device.deviceId}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {device.description && (
                    <p className="text-sm text-gray-600">{device.description}</p>
                  )}
                  
                  <div className="text-sm text-gray-500">
                    {device.lastSeen ? (
                      <span>Last seen: {new Date(device.lastSeen).toLocaleString()}</span>
                    ) : (
                      <span>Never connected</span>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      asChild
                    >
                      <a href={`/stream/${device.id}`}>
                        <Camera className="mr-2 h-4 w-4" />
                        View Stream
                      </a>
                    </Button>
                    
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteDevice(device.id, device.name)}
                      disabled={deleteDeviceMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="text-center space-y-4">
                <AlertCircle className="h-12 w-12 mx-auto text-gray-400" />
                <div>
                  <h3 className="text-lg font-semibold">No devices yet</h3>
                  <p className="text-gray-600 mt-1">
                    Add your first ESP32-CAM birdhouse device to get started
                  </p>
                </div>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Device
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        <Alert>
          <AlertDescription>
            <strong>Note:</strong> Make sure your ESP32-CAM is configured with the correct Device ID 
            and connected to your MQTT broker before adding it here.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { StreamViewer } from '@/components/StreamViewer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft, Bell, BellOff } from 'lucide-react';
// Google OAuth is used for authentication
import { Link } from 'wouter';
import { toast } from 'sonner';
import { usePushNotifications } from '@/hooks/usePushNotifications';

// MQTT broker URL - should be configured based on your setup
const MQTT_BROKER_URL = import.meta.env.VITE_MQTT_BROKER_URL || 'wss://birdhouse.bb36.org:8083';


export default function Stream() {
  const [, params] = useRoute('/stream/:id');
  const deviceId = params?.id ? parseInt(params.id) : null;
  const { user, loading: authLoading } = useAuth();
  const { isSupported, isSubscribed, isLoading: notifLoading, subscribe } = usePushNotifications();

  const { data: devices, isLoading } = trpc.devices.list.useQuery(undefined, {
    enabled: !!user,
  });

  const { data: motionEvents } = trpc.motion.getRecent.useQuery(
    { deviceId: deviceId!, limit: 5 },
    { enabled: !!deviceId && !!user }
  );

  const device = devices?.find((d) => d.id === deviceId);

  const handleEnableNotifications = async () => {
    if (!isSupported) {
      toast.error('Push notifications are not supported in this browser');
      return;
    }

    const success = await subscribe();
    if (success) {
      toast.success('Push notifications enabled successfully!');
    } else {
      toast.error('Failed to enable push notifications');
    }
  };

  if (authLoading || isLoading) {
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
            <CardDescription>Please sign in to view streams</CardDescription>
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

  if (!device) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Device Not Found</CardTitle>
            <CardDescription>The requested device could not be found</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/devices">Back to Devices</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="container max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" asChild>
            <Link href="/devices">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Devices
            </Link>
          </Button>
          
          <Button
            variant={isSubscribed ? 'outline' : 'default'}
            onClick={handleEnableNotifications}
            disabled={isSubscribed || notifLoading || !isSupported}
          >
            {notifLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Subscribing...
              </>
            ) : isSubscribed ? (
              <>
                <Bell className="mr-2 h-4 w-4" />
                Notifications Enabled
              </>
            ) : (
              <>
                <BellOff className="mr-2 h-4 w-4" />
                Enable Notifications
              </>
            )}
          </Button>
        </div>

        <StreamViewer
          deviceId={device.id}
          deviceName={device.name}
          mqttDeviceId={device.deviceId}
          brokerUrl={MQTT_BROKER_URL}
        />

        {motionEvents && motionEvents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Motion Events</CardTitle>
              <CardDescription>Last 5 motion detections</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {motionEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <span className="text-sm">
                      {new Date(event.detectedAt).toLocaleString()}
                    </span>
                    {event.notificationSent === 1 && (
                      <span className="text-xs text-green-600">Notified</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

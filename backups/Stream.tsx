import { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { StreamViewer } from '@/components/StreamViewer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft, Bell, BellOff } from 'lucide-react';
import { getLoginUrl } from '@/const';
import { Link } from 'wouter';
import { toast } from 'sonner';

// MQTT broker URL - should be configured based on your setup
const MQTT_BROKER_URL = 'ws://nt2500.bb36.org:8081';

export default function Stream() {
  const [, params] = useRoute('/stream/:id');
  const deviceId = params?.id ? parseInt(params.id) : null;
  const { user, loading: authLoading } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const { data: devices, isLoading } = trpc.devices.list.useQuery(undefined, {
    enabled: !!user,
  });

  const { data: motionEvents } = trpc.motion.getRecent.useQuery(
    { deviceId: deviceId!, limit: 5 },
    { enabled: !!deviceId && !!user }
  );

  const device = devices?.find((d) => d.id === deviceId);

  useEffect(() => {
    // Check if notifications are already enabled
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      toast.error('This browser does not support notifications');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationsEnabled(true);
      toast.success('Notifications already enabled');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        toast.success('Notifications enabled');
        
        // Register service worker for push notifications
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.register('/sw.js');
          console.log('Service Worker registered:', registration);
        }
      } else {
        toast.error('Notification permission denied');
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast.error('Failed to enable notifications');
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
              <a href={getLoginUrl()}>Sign In</a>
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
            variant={notificationsEnabled ? 'outline' : 'default'}
            onClick={requestNotificationPermission}
            disabled={notificationsEnabled}
          >
            {notificationsEnabled ? (
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

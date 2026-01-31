import { useEffect, useState, useRef } from 'react';
import { useMQTT } from '@/hooks/useMQTT';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Camera, CameraOff, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface StreamViewerProps {
  deviceId: number;
  deviceName: string;
  mqttDeviceId: string;
  brokerUrl: string;
}

export function StreamViewer({ deviceId, deviceName, mqttDeviceId, brokerUrl }: StreamViewerProps) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const expiryRef = useRef<Date | null>(null);

  const startStreamMutation = trpc.devices.startStream.useMutation();
  const stopStreamMutation = trpc.devices.stopStream.useMutation();

  const streamTopic = `device/${mqttDeviceId}/stream`;
  const controlTopic = `device/${mqttDeviceId}/control`;

  const { isConnected, subscribe, unsubscribe, publish } = useMQTT({
    brokerUrl,
    onMessage: (topic, message) => {
      if (topic === streamTopic) {
        try {
          // ESP32-CAM sends JSON: {"deviceId":"...","timestamp":123,"image":"base64data"}
          const text = new TextDecoder().decode(message);
          const data = JSON.parse(text);
          
          if (data.image) {
            // Image is already Base64 encoded, just add data URL prefix
            setImageData(`data:image/jpeg;base64,${data.image}`);
          }
        } catch (error) {
          console.error('Failed to parse MQTT message:', error);
        }
      }
    },
  });

  const startStream = async () => {
    try {
      const result = await startStreamMutation.mutateAsync({ deviceId });
      setSessionId(result.sessionId);
      expiryRef.current = new Date(result.expiresAt);
      
      // Subscribe to stream topic
      subscribe(streamTopic);
      
      // Publish start command to ESP32-CAM
      publish(controlTopic, 'start');
      
      setIsStreaming(true);
      
      // Start countdown timer
      timerRef.current = setInterval(() => {
        if (expiryRef.current) {
          const remaining = Math.max(0, Math.floor((expiryRef.current.getTime() - Date.now()) / 1000));
          setTimeRemaining(remaining);
          
          if (remaining === 0) {
            stopStream();
          }
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to start stream:', error);
    }
  };

  const stopStream = async () => {
    try {
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Publish stop command to ESP32-CAM
      publish(controlTopic, 'stop');
      
      // Unsubscribe from stream topic
      unsubscribe(streamTopic);
      
      // Stop session on server
      if (sessionId) {
        await stopStreamMutation.mutateAsync({ sessionId });
      }
      
      setIsStreaming(false);
      setImageData(null);
      setTimeRemaining(60);
      setSessionId(null);
      expiryRef.current = null;
    } catch (error) {
      console.error('Failed to stop stream:', error);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isStreaming) {
        stopStream();
      }
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          {deviceName}
        </CardTitle>
        <CardDescription>
          {isStreaming ? (
            <span className="flex items-center gap-2 text-green-600">
              <Clock className="h-4 w-4" />
              Streaming - {timeRemaining}s remaining
            </span>
          ) : (
            'Stream inactive'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConnected && (
          <Alert>
            <AlertDescription className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting to MQTT broker...
            </AlertDescription>
          </Alert>
        )}

        <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
          {imageData ? (
            <img 
              src={imageData} 
              alt="Birdhouse stream" 
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <CameraOff className="h-12 w-12 mx-auto mb-2" />
                <p>No stream active</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {!isStreaming ? (
            <Button 
              onClick={startStream} 
              disabled={!isConnected || startStreamMutation.isPending}
              className="w-full"
            >
              {startStreamMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Camera className="mr-2 h-4 w-4" />
                  Start Stream (60s)
                </>
              )}
            </Button>
          ) : (
            <Button 
              onClick={stopStream} 
              variant="destructive"
              disabled={stopStreamMutation.isPending}
              className="w-full"
            >
              {stopStreamMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <CameraOff className="mr-2 h-4 w-4" />
                  Stop Stream
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

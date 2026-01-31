import { useEffect, useRef, useState, useCallback } from 'react';
import mqtt, { MqttClient } from 'mqtt';

interface UseMQTTOptions {
  brokerUrl: string;
  username?: string;
  password?: string;
  onMessage?: (topic: string, message: Buffer) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export function useMQTT(options: UseMQTTOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const clientRef = useRef<MqttClient | null>(null);
  const subscribedTopicsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    console.log('[useMQTT] Attempting to connect to:', options.brokerUrl);
    
    // Connect to MQTT broker via WebSocket
    const client = mqtt.connect(options.brokerUrl, {
      username: options.username,
      password: options.password,
      protocol: 'ws',
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    });

    console.log('[useMQTT] mqtt.connect() called, client created:', client);
    clientRef.current = client;

    client.on('connect', () => {
      console.log('[useMQTT] Connected to MQTT broker!');
      setIsConnected(true);
      setError(null);
      options.onConnect?.();
    });

    client.on('disconnect', () => {
      console.log('[useMQTT] Disconnected from MQTT broker');
      setIsConnected(false);
      options.onDisconnect?.();
    });

    client.on('error', (err) => {
      console.error('[useMQTT] MQTT Error:', err);
      setError(err);
      options.onError?.(err);
    });

    client.on('message', (topic, message) => {
      console.log('[useMQTT] Message received on topic:', topic, 'size:', message.length, 'bytes');
      options.onMessage?.(topic, message);
    });

    return () => {
      client.end();
      clientRef.current = null;
      subscribedTopicsRef.current.clear();
    };
  }, [options.brokerUrl, options.username, options.password]);

  const subscribe = useCallback((topic: string) => {
    console.log('[useMQTT] Attempting to subscribe to:', topic);
    if (clientRef.current && isConnected && !subscribedTopicsRef.current.has(topic)) {
      clientRef.current.subscribe(topic, (err) => {
        if (!err) {
          console.log('[useMQTT] Successfully subscribed to:', topic);
          subscribedTopicsRef.current.add(topic);
        } else {
          console.error('[useMQTT] Failed to subscribe to topic:', topic, err);
        }
      });
    } else {
      console.log('[useMQTT] Cannot subscribe - connected:', isConnected, 'already subscribed:', subscribedTopicsRef.current.has(topic));
    }
  }, [isConnected]);

  const unsubscribe = useCallback((topic: string) => {
    console.log('[useMQTT] Attempting to unsubscribe from:', topic);
    if (clientRef.current && subscribedTopicsRef.current.has(topic)) {
      clientRef.current.unsubscribe(topic, (err) => {
        if (!err) {
          console.log('[useMQTT] Successfully unsubscribed from:', topic);
          subscribedTopicsRef.current.delete(topic);
        } else {
          console.error('[useMQTT] Failed to unsubscribe from topic:', topic, err);
        }
      });
    }
  }, []);

  const publish = useCallback((topic: string, message: string | Buffer) => {
    console.log('[useMQTT] Publishing to topic:', topic, 'message length:', message.length);
    if (clientRef.current && isConnected) {
      clientRef.current.publish(topic, message, (err) => {
        if (err) {
          console.error('[useMQTT] Failed to publish to topic:', topic, err);
        } else {
          console.log('[useMQTT] Successfully published to:', topic);
        }
      });
    } else {
      console.warn('[useMQTT] Cannot publish - not connected');
    }
  }, [isConnected]);

  return {
    isConnected,
    error,
    subscribe,
    unsubscribe,
    publish,
  };
}

# Birdhouse Viewer Project TODO

## Database Schema
- [x] Create devices table for ESP32-CAM registration
- [x] Create device_sessions table for tracking active streams
- [x] Add user-device relationship

## Backend API
- [x] Device registration endpoint
- [x] Device authentication and authorization
- [x] MQTT connection management
- [x] Motion detection notification handler
- [x] Stream session management (60-second timeout)

## Frontend PWA
- [x] MQTT WebSocket client integration
- [x] Real-time image stream viewer component
- [x] Device management interface
- [x] Push notification permission request
- [x] Service worker for background notifications
- [x] PWA manifest configuration
- [x] 60-second auto-stop timer for streams
- [x] Device pairing interface

## ESP32-CAM Arduino Code
- [x] AutoConnect WiFi setup integration
- [x] MQTT client configuration
- [x] Camera initialization and configuration
- [x] Image capture and MQTT publishing
- [x] Motion sensor integration (mmwave)
- [x] Control topic subscription (start/stop)
- [x] On-demand streaming logic

## Server Scripts
- [x] MQTT broker configuration (Mosquitto)
- [x] Motion detection MQTT subscriber
- [x] Push notification sender script
- [x] Multi-user topic routing

## Documentation
- [x] PWA deployment instructions
- [x] ESP32-CAM setup guide
- [x] Mosquitto configuration guide
- [x] Multi-user setup instructions
- [x] Troubleshooting guide

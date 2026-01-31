# Birdhouse Viewer with Motion Detection Alerts

A Progressive Web Application (PWA) for monitoring ESP32-CAM birdhouses with real-time video streaming and motion detection alerts via MQTT.

## Overview

The Birdhouse Viewer system enables users to monitor their birdhouses remotely using ESP32-CAM devices with motion sensors like mmwave, infrared break beam sensors or ultrasonic sensors. The system provides live video streaming on demand and sends push notifications when motion is detected, all while minimizing power consumption through intelligent on-demand streaming.

### Key Features

**Real-Time Streaming**: Watch live video from your birdhouse via MQTT over WebSocket, with automatic 60-second timeout to conserve bandwidth and power.

**Motion Detection Alerts**: Receive instant push notifications on your smartphone when the mmwave sensor detects motion in your birdhouse.

**Multi-User Support**: Each user can register and monitor multiple ESP32-CAM devices with complete privacy and isolation.

**Power Efficient**: The ESP32-CAM only streams when actively viewed, automatically stopping after 60 seconds or when manually stopped.

**Easy WiFi Setup**: The AutoConnect library provides a captive portal for simple WiFi configuration without hardcoding credentials.

**Progressive Web App**: Install the application on your smartphone for a native app-like experience with offline support.

## System Architecture

The system consists of four main components that work together to provide a seamless birdhouse monitoring experience:

### 1. ESP32-CAM Device

The ESP32-CAM serves as the edge device installed in the birdhouse. It captures images from the camera module and monitors the mmwave motion sensor. When a user requests a stream, the device publishes JPEG images to an MQTT topic at approximately 3 frames per second. The device subscribes to a control topic to receive start and stop commands from the PWA.

### 2. MQTT Broker (Mosquitto)

Mosquitto acts as the message broker, facilitating communication between the ESP32-CAM devices and the PWA clients. It provides both standard MQTT on port 1883 for the ESP32-CAM devices and WebSocket support on port 8080 for browser-based clients. The broker handles topic-based routing to ensure each user only receives messages from their registered devices.

### 3. Progressive Web Application

The PWA provides the user interface for device management and stream viewing. Built with React and TypeScript, it connects to the MQTT broker via WebSocket to receive real-time image streams. The application includes a service worker for push notifications and offline support, making it installable on smartphones for a native app experience.

### 4. Backend Server

The Node.js backend handles user authentication, device registration, and session management. It provides a tRPC API for the frontend and runs a Python script that subscribes to motion detection MQTT topics. When motion is detected, the script queries the database to identify the device owner and sends a push notification through the built-in notification service.

## Prerequisites

Before setting up the Birdhouse Viewer system, ensure you have the following components and software installed:

### Hardware Requirements

**ESP32-CAM Board**: AI-Thinker ESP32-CAM or compatible board with OV2640 camera module.

**mmWave Motion Sensor**: A millimeter-wave radar sensor for motion detection (e.g., RCWL-0516 or similar).

**Power Supply**: 5V power supply for the ESP32-CAM (minimum 2A recommended).

**WiFi Network**: 2.4GHz WiFi network for ESP32-CAM connectivity.

### Software Requirements

**Server Environment** (Linux recommended):
- Ubuntu 20.04 or later (or compatible Linux distribution)
- Node.js 18.x or later
- Python 3.7 or later
- MySQL 8.0 or compatible database
- Mosquitto MQTT broker

**Development Tools**:
- Arduino IDE 1.8.x or later (for ESP32-CAM programming)
- ESP32 board support for Arduino
- Git for version control

**Arduino Libraries**:
- AutoConnect library
- PubSubClient (MQTT client)
- esp_camera (included with ESP32 board support)

## Installation Guide

### Step 1: Server Setup

Begin by setting up the server environment that will host the PWA and MQTT broker.

#### Install Mosquitto MQTT Broker

On Ubuntu or Debian-based systems, install Mosquitto using the package manager:

```bash
sudo apt-get update
sudo apt-get install mosquitto mosquitto-clients
```

Copy the provided Mosquitto configuration file to the appropriate location:

```bash
sudo cp server-scripts/mosquitto.conf /etc/mosquitto/conf.d/birdhouse.conf
```

Restart the Mosquitto service to apply the configuration:

```bash
sudo systemctl restart mosquitto
sudo systemctl enable mosquitto
```

Verify that Mosquitto is running and listening on the correct ports:

```bash
sudo systemctl status mosquitto
sudo netstat -tulpn | grep mosquitto
```

You should see Mosquitto listening on ports 1883 (MQTT) and 8080 (WebSocket).

#### Install Python Dependencies

Navigate to the server scripts directory and install the required Python packages:

```bash
cd server-scripts
pip3 install -r requirements.txt
```

For production environments, it is recommended to use a virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### Configure Environment Variables

Create a `.env` file in the server-scripts directory with your configuration:

```bash
MQTT_BROKER=localhost
MQTT_PORT=1883
DATABASE_URL=mysql://username:password@localhost:3306/birdhouse
NOTIFICATION_API_URL=https://your-notification-service.com/api/notify
NOTIFICATION_API_KEY=your-api-key-here
```

Replace the placeholder values with your actual database credentials and notification service details.

#### Set Up the Motion Notification Handler

Install the motion notification handler as a systemd service for automatic startup:

```bash
sudo cp server-scripts/motion-notification.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable motion-notification.service
sudo systemctl start motion-notification.service
```

Check the service status to ensure it is running correctly:

```bash
sudo systemctl status motion-notification.service
```

View the logs to verify proper operation:

```bash
sudo journalctl -u motion-notification.service -f
```

### Step 2: Deploy the PWA

The Progressive Web Application is built using the Manus platform and can be deployed directly from the management interface.

#### Configure the Application

Update the MQTT broker URL in the Stream component to match your server address. Open `client/src/pages/Stream.tsx` and modify the `MQTT_BROKER_URL` constant:

```typescript
const MQTT_BROKER_URL = 'ws://your-server-address:8080';
```

For production deployments, use a secure WebSocket connection:

```typescript
const MQTT_BROKER_URL = 'wss://your-server-address:8080';
```

Note that using WSS requires configuring SSL/TLS certificates for Mosquitto.

#### Build and Deploy

From the project root directory, build the application:

```bash
pnpm install
pnpm build
```

The built application will be available in the `dist` directory. Deploy this to your web server or use the Manus platform's built-in deployment features.

For Manus platform deployment, create a checkpoint and use the Publish button in the management interface.

### Step 3: ESP32-CAM Setup

Configure and program your ESP32-CAM devices with the provided Arduino code.

#### Install Arduino Libraries

Open the Arduino IDE and install the required libraries through the Library Manager:

1. Go to **Sketch → Include Library → Manage Libraries**
2. Search for and install **AutoConnect** by Hieromon
3. Search for and install **PubSubClient** by Nick O'Leary
4. Ensure ESP32 board support is installed via **Tools → Board → Boards Manager**

#### Configure the Device

Open the `esp32-cam/birdhouse_camera.ino` file in Arduino IDE and modify the configuration section:

```cpp
// Unique device identifier - MUST be unique for each ESP32-CAM
#define DEVICE_ID "birdhouse-001"

// MQTT Broker Configuration
#define MQTT_SERVER "your-mqtt-broker.com"
#define MQTT_PORT 1883
#define MQTT_USER ""  // Leave empty if no authentication
#define MQTT_PASSWORD ""

// Motion Sensor Pin Configuration
#define MOTION_SENSOR_PIN 13
```

Each ESP32-CAM device must have a unique `DEVICE_ID` that matches the device ID you will register in the PWA.

#### Upload the Code

Connect your ESP32-CAM to your computer using a USB-to-Serial adapter. Select the correct board and port in the Arduino IDE:

1. **Tools → Board → ESP32 Arduino → AI Thinker ESP32-CAM**
2. **Tools → Port → (select your COM port)**
3. Click the **Upload** button

During upload, you may need to hold the IO0 button on the ESP32-CAM to enter programming mode.

#### Initial WiFi Configuration

After uploading the code, power cycle the ESP32-CAM. It will create a WiFi access point named `BirdhouseCam-{DEVICE_ID}` with password `birdhouse123`.

Connect to this access point using your smartphone or computer. A captive portal will automatically open (or navigate to `http://192.168.4.1`). Select your WiFi network and enter the password to connect the ESP32-CAM to your network.

The device will remember this configuration and automatically reconnect on subsequent power cycles.

### Step 4: Hardware Assembly

Assemble the ESP32-CAM and motion sensor in your birdhouse enclosure.

#### Motion Sensor Connection

Connect the mmwave motion sensor to the ESP32-CAM:

- **Sensor VCC** → ESP32-CAM 3.3V
- **Sensor GND** → ESP32-CAM GND
- **Sensor OUT** → ESP32-CAM GPIO 13 (or your configured pin)

Ensure all connections are secure and properly insulated to prevent short circuits.

#### Power Supply

Provide a stable 5V power supply to the ESP32-CAM. The camera module draws significant current during operation, so a power supply capable of at least 2A is recommended. Insufficient power can cause camera initialization failures or unexpected resets.

#### Weatherproofing

If installing the birdhouse outdoors, ensure the electronics are properly protected from moisture. Use a waterproof enclosure for the ESP32-CAM and seal all cable entry points. Consider using a separate weatherproof box mounted near the birdhouse for the electronics.

## Usage Guide

### Registering a Device

After deploying the PWA and setting up your ESP32-CAM, register the device in the application:

1. Open the Birdhouse Viewer PWA in your web browser
2. Sign in using the authentication system
3. Navigate to **My Devices**
4. Click **Add Device**
5. Enter the Device ID (must match the `DEVICE_ID` in your ESP32-CAM code)
6. Provide a friendly name for the device (e.g., "Front Yard Birdhouse")
7. Optionally add a description
8. Click **Add Device**

The device will now appear in your device list. If the ESP32-CAM is powered on and connected to WiFi, you should see a "Last seen" timestamp update.

### Viewing a Live Stream

To view the live stream from your birdhouse camera:

1. Navigate to **My Devices**
2. Click **View Stream** on the desired device
3. Click **Enable Notifications** to receive motion alerts (first time only)
4. Click **Start Stream (60s)** to begin streaming

The stream will automatically stop after 60 seconds to conserve bandwidth and power. You can manually stop the stream at any time by clicking **Stop Stream**.

### Receiving Motion Alerts

When motion is detected by the mmwave sensor, you will receive a push notification on your device (if notifications are enabled). The notification will display the device name and allow you to quickly open the stream.

To enable notifications:

1. Open the stream page for any device
2. Click **Enable Notifications**
3. Grant permission when prompted by your browser
4. Notifications are now enabled for all your devices

### Installing as a PWA

For the best experience, install the Birdhouse Viewer as a Progressive Web App on your smartphone:

**On Android**:
1. Open the PWA in Chrome
2. Tap the menu button (three dots)
3. Select **Add to Home screen**
4. Confirm the installation

**On iOS**:
1. Open the PWA in Safari
2. Tap the Share button
3. Select **Add to Home Screen**
4. Confirm the installation

The installed PWA will function like a native app with an icon on your home screen and full-screen display.

## Configuration Reference

### MQTT Topic Structure

The system uses a hierarchical topic structure to organize messages:

| Topic Pattern | Direction | Purpose |
|--------------|-----------|---------|
| `birdhouse/{deviceId}/image` | ESP32-CAM → PWA | JPEG image stream |
| `birdhouse/{deviceId}/motion` | ESP32-CAM → Server | Motion detection alerts |
| `birdhouse/{deviceId}/control` | PWA → ESP32-CAM | Start/stop streaming commands |
| `birdhouse/{deviceId}/status` | ESP32-CAM → Server | Device online/offline status |

Replace `{deviceId}` with the unique identifier for each device.

### Database Schema

The application uses three main tables to manage devices and events:

**devices**: Stores registered ESP32-CAM devices with columns for id, userId, deviceId, name, description, isActive, lastSeen, createdAt, and updatedAt.

**deviceSessions**: Tracks active streaming sessions with columns for id, deviceId, userId, startedAt, expiresAt, and isActive.

**motionEvents**: Records motion detection events with columns for id, deviceId, detectedAt, and notificationSent.

### Environment Variables

The following environment variables are used by the server components:

**MQTT_BROKER**: Hostname or IP address of the MQTT broker (default: localhost)

**MQTT_PORT**: Port number for MQTT connections (default: 1883)

**MQTT_USER**: Username for MQTT authentication (optional)

**MQTT_PASSWORD**: Password for MQTT authentication (optional)

**DATABASE_URL**: MySQL connection string in the format `mysql://user:password@host:port/database`

**NOTIFICATION_API_URL**: URL for the push notification service

**NOTIFICATION_API_KEY**: API key for authenticating with the notification service

## Troubleshooting

### ESP32-CAM Issues

**Camera initialization failed**: This typically indicates insufficient power supply. Ensure you are using a power supply capable of at least 2A. Try a different USB cable or power adapter.

**Cannot connect to WiFi**: Verify that your WiFi network is 2.4GHz (ESP32 does not support 5GHz). Check that the SSID and password are correct in the AutoConnect portal. Ensure the ESP32-CAM is within range of your WiFi router.

**Images not appearing in PWA**: Verify that the MQTT broker is running and accessible from both the ESP32-CAM and the PWA. Check the Arduino Serial Monitor for connection status messages. Ensure the MQTT topics match between the ESP32-CAM code and the PWA configuration.

**Motion sensor not triggering**: Verify the wiring connections between the motion sensor and ESP32-CAM. Check that the sensor is receiving power (3.3V). Test the sensor output with a multimeter or LED to confirm it is functioning. Adjust the `MOTION_DEBOUNCE` value if the sensor is too sensitive or not sensitive enough.

### Server Issues

**Mosquitto not starting**: Check the configuration file for syntax errors using `mosquitto -c /etc/mosquitto/conf.d/birdhouse.conf -v`. Verify that ports 1883 and 8080 are not already in use by another service. Review the Mosquitto log file at `/var/log/mosquitto/mosquitto.log` for error messages.

**Motion notification handler not running**: Check the service status with `sudo systemctl status motion-notification.service`. Review the logs using `sudo journalctl -u motion-notification.service`. Verify that the DATABASE_URL environment variable is correctly configured in the service file.

**Database connection errors**: Ensure the MySQL server is running and accessible. Verify the database credentials in the DATABASE_URL environment variable. Check that the database and tables have been created by running the migrations.

### PWA Issues

**Cannot connect to MQTT broker**: Verify that the MQTT broker WebSocket listener is running on port 8080. Check that the `MQTT_BROKER_URL` in the Stream component matches your server address. If using HTTPS for the PWA, you must use WSS (secure WebSocket) for the MQTT connection.

**Push notifications not working**: Ensure you have granted notification permissions in your browser settings. Verify that the service worker is registered by checking the browser's developer tools. Check that the notification API URL and key are correctly configured in the motion notification handler.

**Stream stops immediately**: Check the browser console for JavaScript errors. Verify that the device is registered in the database and associated with your user account. Ensure the ESP32-CAM is powered on and connected to the MQTT broker.

## Security Considerations

The default configuration prioritizes ease of setup over security and is suitable for development and testing environments. For production deployments, implement the following security measures:

### MQTT Authentication

Disable anonymous access to the MQTT broker and configure username/password authentication. Create a password file using the `mosquitto_passwd` utility:

```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd username
```

Update the Mosquitto configuration to require authentication:

```
allow_anonymous false
password_file /etc/mosquitto/passwd
```

Update the ESP32-CAM code and motion notification handler with the MQTT credentials.

### SSL/TLS Encryption

Configure Mosquitto to use SSL/TLS for encrypted connections. Generate or obtain SSL certificates and update the Mosquitto configuration:

```
listener 8883
protocol mqtt
cafile /etc/mosquitto/certs/ca.crt
certfile /etc/mosquitto/certs/server.crt
keyfile /etc/mosquitto/certs/server.key

listener 8084
protocol websockets
cafile /etc/mosquitto/certs/ca.crt
certfile /etc/mosquitto/certs/server.crt
keyfile /etc/mosquitto/certs/server.key
```

Update all clients to use the secure ports (8883 for MQTT, 8084 for WebSocket).

### Network Isolation

Consider deploying the MQTT broker on a private network or VPN to prevent unauthorized access. Use firewall rules to restrict access to the MQTT ports from trusted IP addresses only.

### Regular Updates

Keep all software components up to date with the latest security patches. Regularly update the ESP32 Arduino core, Arduino libraries, Mosquitto broker, and Node.js dependencies.

## Advanced Configuration

### Adjusting Image Quality

To modify the image quality and frame rate, adjust the camera configuration in the ESP32-CAM code:

```cpp
config.frame_size = FRAMESIZE_SVGA;  // Options: QVGA, VGA, SVGA, XGA, HD, etc.
config.jpeg_quality = 10;  // 0-63, lower = higher quality
```

And the streaming interval:

```cpp
const unsigned long IMAGE_INTERVAL = 300;  // Milliseconds between images
```

Lower quality and frame rate reduce bandwidth usage but may affect image clarity.

### Multi-Broker Setup

For large deployments, consider using multiple MQTT brokers with load balancing. Configure the ESP32-CAM devices to connect to different brokers based on geographic location or device ID ranges.

### Cloud Integration

The Mosquitto broker can be configured to bridge with cloud MQTT services for remote access and redundancy. Uncomment and configure the bridge section in `mosquitto.conf`:

```
connection bridge-to-cloud
address cloud-broker.example.com:1883
topic birdhouse/# both 0
```

This allows messages to be forwarded to a cloud broker while maintaining local processing.

## Contributing

Contributions to the Birdhouse Viewer project are welcome. Please submit issues and pull requests through the project repository.

## License

This project is provided as-is for educational and personal use. Please review the licenses of all included libraries and dependencies.

## Support

For questions, issues, or feature requests, please open an issue in the project repository or contact the development team.

---

**Author**: Manus AI  
**Version**: 1.0.0  
**Last Updated**: November 2025

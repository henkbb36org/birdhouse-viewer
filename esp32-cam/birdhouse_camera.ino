/*
 * Birdhouse Viewer - ESP32-CAM with Motion Detection
 * 
 * This code enables ESP32-CAM to:
 * - Connect to WiFi using AutoConnect (captive portal for easy setup)
 * - Publish camera images to MQTT broker
 * - Detect motion using mmwave sensor
 * - Respond to start/stop streaming commands
 * - Support multi-user architecture with unique device IDs
 * 
 * Hardware Requirements:
 * - ESP32-CAM board (AI-Thinker or compatible)
 * - mmWave motion sensor (connected to GPIO pins)
 * - MQTT broker with WebSocket support (Mosquitto)
 * 
 * Libraries Required:
 * - AutoConnect (https://github.com/Hieromon/AutoConnect)
 * - PubSubClient (MQTT client)
 * - esp_camera (built-in for ESP32-CAM)
 */

#include <WiFi.h>
#include <WebServer.h>
#include <AutoConnect.h>
#include <PubSubClient.h>
#include "esp_camera.h"

// ============================================================================
// CONFIGURATION - MODIFY THESE VALUES
// ============================================================================

// Unique device identifier - MUST be unique for each ESP32-CAM
#define DEVICE_ID "birdhouse-001"

// MQTT Broker Configuration
#define MQTT_SERVER "your-mqtt-broker.com"  // Replace with your MQTT broker address
#define MQTT_PORT 1883
#define MQTT_USER ""  // Leave empty if no authentication
#define MQTT_PASSWORD ""  // Leave empty if no authentication

// Motion Sensor Pin Configuration
#define MOTION_SENSOR_PIN 13  // GPIO pin connected to mmwave sensor output

// Camera Configuration (AI-Thinker ESP32-CAM)
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

WebServer server;
AutoConnect portal(server);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// MQTT Topics
String topicImage = "birdhouse/" + String(DEVICE_ID) + "/image";
String topicMotion = "birdhouse/" + String(DEVICE_ID) + "/motion";
String topicControl = "birdhouse/" + String(DEVICE_ID) + "/control";
String topicStatus = "birdhouse/" + String(DEVICE_ID) + "/status";

// Streaming control
bool isStreaming = false;
unsigned long lastImageTime = 0;
const unsigned long IMAGE_INTERVAL = 300;  // 300ms between images (~3 FPS)

// Motion detection
bool motionDetected = false;
unsigned long lastMotionTime = 0;
const unsigned long MOTION_DEBOUNCE = 2000;  // 2 seconds debounce

// ============================================================================
// CAMERA INITIALIZATION
// ============================================================================

bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  
  // Init with high specs to pre-allocate larger buffers
  if(psramFound()){
    config.frame_size = FRAMESIZE_SVGA;  // 800x600
    config.jpeg_quality = 10;  // 0-63 lower means higher quality
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_VGA;  // 640x480
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }
  
  // Camera init
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    return false;
  }
  
  // Adjust sensor settings
  sensor_t * s = esp_camera_sensor_get();
  if (s != NULL) {
    s->set_brightness(s, 0);     // -2 to 2
    s->set_contrast(s, 0);       // -2 to 2
    s->set_saturation(s, 0);     // -2 to 2
    s->set_special_effect(s, 0); // 0 to 6 (0 - No Effect)
    s->set_whitebal(s, 1);       // 0 = disable , 1 = enable
    s->set_awb_gain(s, 1);       // 0 = disable , 1 = enable
    s->set_wb_mode(s, 0);        // 0 to 4
    s->set_exposure_ctrl(s, 1);  // 0 = disable , 1 = enable
    s->set_aec2(s, 0);           // 0 = disable , 1 = enable
    s->set_ae_level(s, 0);       // -2 to 2
    s->set_aec_value(s, 300);    // 0 to 1200
    s->set_gain_ctrl(s, 1);      // 0 = disable , 1 = enable
    s->set_agc_gain(s, 0);       // 0 to 30
    s->set_gainceiling(s, (gainceiling_t)0);  // 0 to 6
    s->set_bpc(s, 0);            // 0 = disable , 1 = enable
    s->set_wpc(s, 1);            // 0 = disable , 1 = enable
    s->set_raw_gma(s, 1);        // 0 = disable , 1 = enable
    s->set_lenc(s, 1);           // 0 = disable , 1 = enable
    s->set_hmirror(s, 0);        // 0 = disable , 1 = enable
    s->set_vflip(s, 0);          // 0 = disable , 1 = enable
    s->set_dcw(s, 1);            // 0 = disable , 1 = enable
    s->set_colorbar(s, 0);       // 0 = disable , 1 = enable
  }
  
  Serial.println("Camera initialized successfully");
  return true;
}

// ============================================================================
// MQTT FUNCTIONS
// ============================================================================

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.printf("Message arrived [%s]: %s\n", topic, message.c_str());
  
  // Handle control messages
  if (String(topic) == topicControl) {
    if (message == "start") {
      isStreaming = true;
      Serial.println("Streaming started");
    } else if (message == "stop") {
      isStreaming = false;
      Serial.println("Streaming stopped");
    }
  }
}

void reconnectMQTT() {
  // Loop until we're reconnected
  while (!mqttClient.connected()) {
    Serial.print("Attempting MQTT connection...");
    
    // Create a random client ID
    String clientId = "ESP32CAM-" + String(DEVICE_ID);
    
    // Attempt to connect
    bool connected;
    if (strlen(MQTT_USER) > 0) {
      connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD);
    } else {
      connected = mqttClient.connect(clientId.c_str());
    }
    
    if (connected) {
      Serial.println("connected");
      
      // Subscribe to control topic
      mqttClient.subscribe(topicControl.c_str());
      
      // Publish status
      mqttClient.publish(topicStatus.c_str(), "online");
      
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void publishImage() {
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Camera capture failed");
    return;
  }
  
  // Publish image in chunks if necessary (MQTT has message size limits)
  const int MAX_CHUNK_SIZE = 4096;  // 4KB chunks
  
  if (fb->len <= MAX_CHUNK_SIZE) {
    // Small image, send in one message
    mqttClient.publish(topicImage.c_str(), fb->buf, fb->len);
  } else {
    // Large image, need to implement chunking or reduce quality
    // For simplicity, we'll just send the first chunk
    // In production, implement proper chunking protocol
    Serial.printf("Image too large (%d bytes), sending first chunk only\n", fb->len);
    mqttClient.publish(topicImage.c_str(), fb->buf, MAX_CHUNK_SIZE);
  }
  
  esp_camera_fb_return(fb);
}

void publishMotionAlert() {
  String payload = "{\"deviceId\":\"" + String(DEVICE_ID) + "\",\"timestamp\":" + String(millis()) + "}";
  mqttClient.publish(topicMotion.c_str(), payload.c_str());
  Serial.println("Motion alert published");
}

// ============================================================================
// MOTION DETECTION
// ============================================================================

void IRAM_ATTR motionISR() {
  motionDetected = true;
}

void setupMotionSensor() {
  pinMode(MOTION_SENSOR_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(MOTION_SENSOR_PIN), motionISR, RISING);
  Serial.println("Motion sensor initialized");
}

void handleMotionDetection() {
  if (motionDetected) {
    unsigned long currentTime = millis();
    
    // Debounce motion detection
    if (currentTime - lastMotionTime > MOTION_DEBOUNCE) {
      lastMotionTime = currentTime;
      publishMotionAlert();
    }
    
    motionDetected = false;
  }
}

// ============================================================================
// SETUP AND LOOP
// ============================================================================

void setup() {
  Serial.begin(115200);
  Serial.println("\n\nBirdhouse Viewer - ESP32-CAM Starting...");
  
  // Initialize camera
  if (!initCamera()) {
    Serial.println("Camera initialization failed!");
    ESP.restart();
  }
  
  // Initialize motion sensor
  setupMotionSensor();
  
  // Configure AutoConnect
  AutoConnectConfig config;
  config.apid = "BirdhouseCam-" + String(DEVICE_ID);
  config.psk = "birdhouse123";
  config.title = "Birdhouse Camera Setup";
  config.homeUri = "/";
  portal.config(config);
  
  // Start AutoConnect portal
  if (portal.begin()) {
    Serial.println("WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Connection failed");
    ESP.restart();
  }
  
  // Setup MQTT
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(8192);  // Increase buffer for images
  
  Serial.println("Setup complete");
}

void loop() {
  // Handle AutoConnect portal
  portal.handleClient();
  
  // Handle MQTT connection
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();
  
  // Handle motion detection
  handleMotionDetection();
  
  // Publish images if streaming is active
  if (isStreaming) {
    unsigned long currentTime = millis();
    if (currentTime - lastImageTime >= IMAGE_INTERVAL) {
      lastImageTime = currentTime;
      publishImage();
    }
  }
  
  delay(10);  // Small delay to prevent watchdog issues
}

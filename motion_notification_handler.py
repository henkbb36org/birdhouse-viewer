#!/usr/bin/env python3
"""
Birdhouse Viewer - Motion Detection Notification Handler

This script subscribes to MQTT motion detection topics and sends push notifications
to users when motion is detected in their birdhouses.

Requirements:
- Python 3.7+
- paho-mqtt
- requests
- python-dotenv (optional, for environment variables)

Installation:
    pip install paho-mqtt requests python-dotenv

Usage:
    python motion_notification_handler.py

Configuration:
    Set environment variables or modify the configuration section below:
    - MQTT_BROKER: MQTT broker address
    - MQTT_PORT: MQTT broker port
    - MQTT_USER: MQTT username (optional)
    - MQTT_PASSWORD: MQTT password (optional)
    - DATABASE_URL: MySQL database connection string
    - NOTIFICATION_API_URL: Push notification service URL
    - NOTIFICATION_API_KEY: API key for notification service
"""

import os
import sys
import json
import time
import logging
from datetime import datetime
from typing import Dict, Optional
import paho.mqtt.client as mqtt
import requests
import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv
# ============================================================================
# CONFIGURATION
# ============================================================================

load_dotenv()

# MQTT Configuration
MQTT_BROKER = os.getenv('MQTT_BROKER', 'localhost')
MQTT_PORT = int(os.getenv('MQTT_PORT', '1883'))
MQTT_USER = os.getenv('MQTT_USER', '')
MQTT_PASSWORD = os.getenv('MQTT_PASSWORD', '')
MQTT_TOPIC_PATTERN = 'device/+/motion'  # Subscribe to all device motion topics

# Database Configuration
DATABASE_URL = os.getenv('DATABASE_URL', '')

# Notification Configuration
NOTIFICATION_API_URL = os.getenv('NOTIFICATION_API_URL', '')
NOTIFICATION_API_KEY = os.getenv('NOTIFICATION_API_KEY', '')

# Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('motion_notifications.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# ============================================================================
# DATABASE FUNCTIONS
# ============================================================================

def parse_database_url(url: str) -> Dict[str, str]:
    """Parse MySQL database URL into connection parameters."""
    # Format: mysql://user:password@host:port/database
    if not url.startswith('mysql://'):
        raise ValueError("Invalid database URL format")
    
    url = url.replace('mysql://', '')
    
    # Extract credentials
    if '@' in url:
        credentials, host_part = url.split('@', 1)
        if ':' in credentials:
            user, password = credentials.split(':', 1)
        else:
            user = credentials
            password = ''
    else:
        raise ValueError("Database URL must include credentials")
    
    # Extract host, port, and database
    if '/' in host_part:
        host_port, database = host_part.split('/', 1)
    else:
        raise ValueError("Database URL must include database name")
    
    if ':' in host_port:
        host, port = host_port.split(':', 1)
    else:
        host = host_port
        port = '3306'
    
    return {
        'host': host,
        'port': int(port),
        'user': user,
        'password': password,
        'database': database
    }

def get_database_connection():
    """Create and return a database connection."""
    try:
        if not DATABASE_URL:
            logger.error("DATABASE_URL not configured")
            return None
        
        config = parse_database_url(DATABASE_URL)
        connection = mysql.connector.connect(**config)
        
        if connection.is_connected():
            logger.info("Successfully connected to database")
            return connection
    except Error as e:
        logger.error(f"Error connecting to database: {e}")
        return None

def get_device_info(device_id: str) -> Optional[Dict]:
    """Get device information from database."""
    connection = get_database_connection()
    if not connection:
        return None
    
    try:
        cursor = connection.cursor(dictionary=True)
        query = """
            SELECT d.id, d.ownerId, d.name, d.deviceId, u.email, u.name as userName
            FROM devices d
            JOIN users u ON d.ownerId = u.id
            WHERE d.deviceId = %s AND d.isActive = 1
        """
        cursor.execute(query, (device_id,))
        result = cursor.fetchone()
        cursor.close()
        connection.close()
        return result
    except Error as e:
        logger.error(f"Error querying device info: {e}")
        if connection:
            connection.close()
        return None

def record_motion_event(device_id: int) -> Optional[int]:
    """Record motion event in database and return event ID."""
    connection = get_database_connection()
    if not connection:
        return None
    
    try:
        cursor = connection.cursor()
        query = """
            INSERT INTO motionEvents (deviceId, detectedAt, notificationSent)
            VALUES (%s, NOW(), 0)
        """
        cursor.execute(query, (device_id,))
        connection.commit()
        event_id = cursor.lastrowid
        cursor.close()
        connection.close()
        return event_id
    except Error as e:
        logger.error(f"Error recording motion event: {e}")
        if connection:
            connection.close()
        return None

def mark_notification_sent(event_id: int):
    """Mark that notification has been sent for a motion event."""
    connection = get_database_connection()
    if not connection:
        return
    
    try:
        cursor = connection.cursor()
        query = "UPDATE motionEvents SET notificationSent = 1 WHERE id = %s"
        cursor.execute(query, (event_id,))
        connection.commit()
        cursor.close()
        connection.close()
    except Error as e:
        logger.error(f"Error marking notification sent: {e}")
        if connection:
            connection.close()

# ============================================================================
# NOTIFICATION FUNCTIONS
# ============================================================================

def send_push_notification_to_device_users(device_db_id: int, device_name: str, device_id: str) -> bool:
    """Send push notification to all users with access to the device (owner + shared users)."""
    if not NOTIFICATION_API_URL or not NOTIFICATION_API_KEY:
        logger.warning("Notification API not configured")
        return False
    
    try:
        payload = {
            'deviceId': device_db_id,
            'title': f'Motion Detected: {device_name}',
            'body': f'Motion was detected in your birdhouse "{device_name}"',
            'data': {
                'deviceId': device_id,
                'type': 'motion_detection',
                'timestamp': datetime.now().isoformat()
            }
        }
        
        headers = {
            'Authorization': f'Bearer {NOTIFICATION_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        response = requests.post(
            NOTIFICATION_API_URL,
            json=payload,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            logger.info(f"Notifications sent: {result.get('sent', 0)} successful, {result.get('failed', 0)} failed")
            return True
        else:
            logger.error(f"Failed to send notification: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"Error sending notification: {e}")
        return False

# ============================================================================
# MQTT FUNCTIONS
# ============================================================================

def on_connect(client, userdata, flags, rc):
    """Callback for when the client connects to the broker."""
    if rc == 0:
        logger.info("Connected to MQTT broker successfully")
        client.subscribe(MQTT_TOPIC_PATTERN)
        logger.info(f"Subscribed to topic pattern: {MQTT_TOPIC_PATTERN}")
    else:
        logger.error(f"Failed to connect to MQTT broker with code: {rc}")

def on_disconnect(client, userdata, rc):
    """Callback for when the client disconnects from the broker."""
    if rc != 0:
        logger.warning(f"Unexpected disconnection from MQTT broker: {rc}")
    else:
        logger.info("Disconnected from MQTT broker")

def on_message(client, userdata, msg):
    """Callback for when a message is received."""
    try:
        topic = msg.topic
        payload = msg.payload.decode('utf-8')
        
        logger.info(f"Received message on topic: {topic}")
        
        # Extract device ID from topic (format: birdhouse/{deviceId}/motion)
        topic_parts = topic.split('/')
        if len(topic_parts) != 3 or topic_parts[0] != 'device' or topic_parts[2] != 'motion':
            logger.warning(f"Invalid topic format: {topic}")
            return
        
        device_id_str = topic_parts[1]
        
        # Parse payload (expecting JSON with deviceId and timestamp)
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON payload: {payload}")
            return
        
        # Get device information from database
        device_info = get_device_info(device_id_str)
        if not device_info:
            logger.warning(f"Device not found or inactive: {device_id_str}")
            return
        
        logger.info(f"Motion detected for device: {device_info['name']} (User: {device_info['userName']})")
        
        # Record motion event in database
        event_id = record_motion_event(device_info['id'])
        if not event_id:
            logger.error("Failed to record motion event")
            return
      
        # Send push notification to all users with access (owner + shared users)
        notification_sent = send_push_notification_to_device_users(
            device_info['id'],
            device_info['name'],
            device_info['deviceId']
        )
        
        # Mark notification as sent if successful
        if notification_sent:
            mark_notification_sent(event_id)
        
    except Exception as e:
        logger.error(f"Error processing message: {e}", exc_info=True)

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Main function to start the MQTT subscriber."""
    logger.info("Starting Motion Detection Notification Handler")
    
    # Validate configuration
    if not DATABASE_URL:
        logger.error("DATABASE_URL environment variable is required")
        sys.exit(1)
    
    # Create MQTT client
    client = mqtt.Client(client_id="motion-notification-handler")
    
    # Set callbacks
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    
    # Set credentials if provided
    if MQTT_USER and MQTT_PASSWORD:
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
    
    # Connect to broker
    try:
        logger.info(f"Connecting to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}")
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
    except Exception as e:
        logger.error(f"Failed to connect to MQTT broker: {e}")
        sys.exit(1)
    
    # Start the loop
    try:
        logger.info("Starting MQTT loop...")
        client.loop_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down gracefully...")
        client.disconnect()
        sys.exit(0)
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()

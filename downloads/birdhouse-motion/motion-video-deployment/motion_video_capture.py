#!/usr/bin/env python3
"""
Motion Video Capture Service for Birdhouse Viewer
Captures 5-second video clips when motion is detected and converts them to MJPEG format.
"""

import paho.mqtt.client as mqtt
import mysql.connector
import os
import json
import base64
import subprocess
import time
from datetime import datetime
from pathlib import Path
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
MQTT_BROKER = os.getenv('MQTT_BROKER', '192.168.2.1')
MQTT_PORT = int(os.getenv('MQTT_PORT', '1883'))
MQTT_USER = os.getenv('MQTT_USER', '')
MQTT_PASSWORD = os.getenv('MQTT_PASSWORD', '')

DB_HOST = 'localhost'
DB_USER = os.getenv('DB_USER', 'henk')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')
DB_NAME = os.getenv('DB_NAME', 'birdhouse')

VIDEO_DIR = '/opt/birdhouse-viewer/videos'
MAX_VIDEOS = 50
VIDEO_DURATION = 5  # seconds
FRAME_RATE = 10  # frames per second

# Ensure video directory exists
Path(VIDEO_DIR).mkdir(parents=True, exist_ok=True)

# Active captures: {device_id: {'frames': [], 'start_time': timestamp, 'motion_event_id': id}}
active_captures = {}


def get_db_connection():
    """Create database connection"""
    try:
        # Extract password from DATABASE_URL if needed
        database_url = os.getenv('DATABASE_URL', '')
        if database_url and 'mysql://' in database_url:
            # Parse: mysql://user:password@host:port/database
            parts = database_url.replace('mysql://', '').split('@')
            user_pass = parts[0].split(':')
            host_db = parts[1].split('/')
            host = host_db[0].split(':')[0]
            
            return mysql.connector.connect(
                host=host,
                user=user_pass[0],
                password=user_pass[1] if len(user_pass) > 1 else '',
                database=host_db[1] if len(host_db) > 1 else DB_NAME
            )
        else:
            return mysql.connector.connect(
                host=DB_HOST,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME
            )
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        return None


def get_device_info(device_id):
    """Get device information from database"""
    conn = get_db_connection()
    if not conn:
        return None
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, userId, name FROM devices WHERE deviceId = %s",
            (device_id,)
        )
        device = cursor.fetchone()
        cursor.close()
        conn.close()
        return device
    except Exception as e:
        logger.error(f"Error fetching device info: {e}")
        return None


def create_motion_event(device_db_id):
    """Create motion event record and return its ID"""
    conn = get_db_connection()
    if not conn:
        return None
    
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO motionEvents (deviceId, detectedAt, notificationSent) VALUES (%s, NOW(), 1)",
            (device_db_id,)
        )
        conn.commit()
        motion_event_id = cursor.lastrowid
        cursor.close()
        conn.close()
        logger.info(f"Created motion event ID: {motion_event_id}")
        return motion_event_id
    except Exception as e:
        logger.error(f"Error creating motion event: {e}")
        return None


def cleanup_old_videos(device_db_id):
    """Remove oldest videos if count exceeds MAX_VIDEOS"""
    conn = get_db_connection()
    if not conn:
        return
    
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Get count of videos for this device
        cursor.execute(
            "SELECT COUNT(*) as count FROM motionVideos WHERE deviceId = %s",
            (device_db_id,)
        )
        result = cursor.fetchone()
        count = result['count'] if result else 0
        
        if count >= MAX_VIDEOS:
            # Get oldest videos to delete
            videos_to_delete = count - MAX_VIDEOS + 1
            cursor.execute(
                """SELECT id, filepath FROM motionVideos 
                   WHERE deviceId = %s 
                   ORDER BY capturedAt ASC 
                   LIMIT %s""",
                (device_db_id, videos_to_delete)
            )
            old_videos = cursor.fetchall()
            
            for video in old_videos:
                # Delete file
                try:
                    if os.path.exists(video['filepath']):
                        os.remove(video['filepath'])
                        logger.info(f"Deleted old video file: {video['filepath']}")
                except Exception as e:
                    logger.error(f"Error deleting video file: {e}")
                
                # Delete database record
                cursor.execute("DELETE FROM motionVideos WHERE id = %s", (video['id'],))
            
            conn.commit()
            logger.info(f"Cleaned up {len(old_videos)} old videos")
        
        cursor.close()
        conn.close()
    except Exception as e:
        logger.error(f"Error cleaning up old videos: {e}")


def save_video_to_db(device_db_id, motion_event_id, filename, filepath, filesize):
    """Save video metadata to database"""
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO motionVideos 
               (deviceId, motionEventId, filename, filepath, duration, filesize, capturedAt) 
               VALUES (%s, %s, %s, %s, %s, %s, NOW())""",
            (device_db_id, motion_event_id, filename, filepath, VIDEO_DURATION, filesize)
        )
        conn.commit()
        cursor.close()
        conn.close()
        logger.info(f"Saved video metadata to database: {filename}")
        return True
    except Exception as e:
        logger.error(f"Error saving video to database: {e}")
        return False


def create_mjpeg_video(frames, output_path):
    """Convert frames to MJPEG video using ffmpeg"""
    try:
        # Create temporary directory for frames
        temp_dir = f"{VIDEO_DIR}/temp_{int(time.time())}"
        Path(temp_dir).mkdir(parents=True, exist_ok=True)
        
        # Save frames as individual JPEG files
        for i, frame_data in enumerate(frames):
            frame_path = f"{temp_dir}/frame_{i:04d}.jpg"
            with open(frame_path, 'wb') as f:
                f.write(frame_data)
        
        # Use ffmpeg to create MJPEG video
        # -framerate: input frame rate
        # -i: input pattern
        # -c:v mjpeg: codec
        # -q:v 2: quality (2 is high quality)
        cmd = [
            'ffmpeg',
            '-y',  # Overwrite output file
            '-framerate', str(FRAME_RATE),
            '-i', f'{temp_dir}/frame_%04d.jpg',
            '-c:v', 'mjpeg',
            '-q:v', '2',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"ffmpeg error: {result.stderr}")
            return False
        
        # Clean up temporary frames
        for file in Path(temp_dir).glob('*.jpg'):
            file.unlink()
        Path(temp_dir).rmdir()
        
        logger.info(f"Created MJPEG video: {output_path}")
        return True
        
    except Exception as e:
        logger.error(f"Error creating MJPEG video: {e}")
        return False


def process_stream_message(device_id, message):
    """Process incoming stream message and add frame to active capture"""
    try:
        # Parse JSON message
        data = json.loads(message.decode('utf-8'))
        
        if 'image' not in data:
            return
        
        # Decode Base64 image
        image_data = base64.b64decode(data['image'])
        
        # Add frame to active capture
        if device_id in active_captures:
            capture = active_captures[device_id]
            capture['frames'].append(image_data)
            
            # Check if we have enough frames
            elapsed = time.time() - capture['start_time']
            expected_frames = int(VIDEO_DURATION * FRAME_RATE)
            
            if len(capture['frames']) >= expected_frames or elapsed >= VIDEO_DURATION + 1:
                # Finalize video
                finalize_video(device_id)
                
    except json.JSONDecodeError:
        logger.error(f"Failed to parse JSON from device {device_id}")
    except Exception as e:
        logger.error(f"Error processing stream message: {e}")


def finalize_video(device_id):
    """Finalize and save the captured video"""
    if device_id not in active_captures:
        return
    
    capture = active_captures[device_id]
    frames = capture['frames']
    motion_event_id = capture['motion_event_id']
    device_db_id = capture['device_db_id']
    
    if len(frames) < 5:  # Need at least a few frames
        logger.warning(f"Not enough frames captured for {device_id}: {len(frames)}")
        del active_captures[device_id]
        return
    
    # Generate filename
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"{device_id}_{timestamp}.mjpeg"
    filepath = os.path.join(VIDEO_DIR, filename)
    
    # Create MJPEG video
    if create_mjpeg_video(frames, filepath):
        # Get file size
        filesize = os.path.getsize(filepath)
        
        # Save to database
        if save_video_to_db(device_db_id, motion_event_id, filename, filepath, filesize):
            # Cleanup old videos
            cleanup_old_videos(device_db_id)
            logger.info(f"Successfully created video: {filename} ({len(frames)} frames, {filesize} bytes)")
        else:
            # Delete file if database save failed
            if os.path.exists(filepath):
                os.remove(filepath)
    
    # Remove from active captures
    del active_captures[device_id]


def start_video_capture(device_id):
    """Start capturing video for a device"""
    device_info = get_device_info(device_id)
    if not device_info:
        logger.error(f"Device not found: {device_id}")
        return
    
    # Create motion event
    motion_event_id = create_motion_event(device_info['id'])
    if not motion_event_id:
        logger.error(f"Failed to create motion event for {device_id}")
        return
    
    # Initialize capture
    active_captures[device_id] = {
        'frames': [],
        'start_time': time.time(),
        'motion_event_id': motion_event_id,
        'device_db_id': device_info['id']
    }
    
    logger.info(f"Started video capture for {device_id} (motion event {motion_event_id})")
    
    # Send start command to ESP32-CAM
    mqtt_client.publish(f"device/{device_id}/control", "start")


def on_connect(client, userdata, flags, rc):
    """MQTT connection callback"""
    if rc == 0:
        logger.info("Connected to MQTT broker")
        # Subscribe to motion events
        client.subscribe("device/+/motion")
        logger.info("Subscribed to device/+/motion")
        # Subscribe to stream messages for active captures
        client.subscribe("device/+/stream")
        logger.info("Subscribed to device/+/stream")
    else:
        logger.error(f"Failed to connect to MQTT broker: {rc}")


def on_message(client, userdata, msg):
    """MQTT message callback"""
    try:
        topic_parts = msg.topic.split('/')
        if len(topic_parts) < 3:
            return
        
        device_id = topic_parts[1]
        topic_type = topic_parts[2]
        
        if topic_type == 'motion':
            # Motion detected - start video capture
            payload = msg.payload.decode('utf-8').strip()
            if payload == 'detected':
                logger.info(f"Motion detected on {device_id}")
                start_video_capture(device_id)
        
        elif topic_type == 'stream':
            # Stream frame - add to active capture
            if device_id in active_captures:
                process_stream_message(device_id, msg.payload)
                
    except Exception as e:
        logger.error(f"Error in on_message: {e}")


# Initialize MQTT client
mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

if MQTT_USER and MQTT_PASSWORD:
    mqtt_client.username_pw_set(MQTT_USER, MQTT_PASSWORD)

# Main loop
if __name__ == "__main__":
    logger.info("Starting Motion Video Capture Service")
    logger.info(f"MQTT Broker: {MQTT_BROKER}:{MQTT_PORT}")
    logger.info(f"Video Directory: {VIDEO_DIR}")
    logger.info(f"Max Videos: {MAX_VIDEOS}")
    
    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        mqtt_client.disconnect()
    except Exception as e:
        logger.error(f"Fatal error: {e}")

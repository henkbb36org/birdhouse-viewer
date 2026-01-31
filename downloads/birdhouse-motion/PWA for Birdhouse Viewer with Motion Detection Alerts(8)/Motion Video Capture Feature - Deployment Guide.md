# Motion Video Capture Feature - Deployment Guide

**Date:** 2025-11-19  
**Feature:** 5-second MJPEG video clips on motion detection with video gallery

## Overview

This update adds automatic video capture when motion is detected. The system captures 5 seconds of video, converts it to MJPEG format, and stores it with a maximum of 50 videos per device (round-robin deletion of oldest videos).

### New Components

1. **motion_video_capture.py** - Python service that captures video clips
2. **motionVideos database table** - Stores video metadata
3. **Video API endpoints** - tRPC and Express routes for video management
4. **Video Gallery page** - Frontend UI to view and manage videos

---

## Pre-Deployment Checklist

- [ ] Backup current database
- [ ] Backup current application files
- [ ] Verify ffmpeg is installed (`ffmpeg -version`)
- [ ] Ensure at least 5GB free disk space for videos
- [ ] Test rollback procedure on staging (if available)

---

## Installation Steps

### 1. Backup Current System

```bash
# Backup database
mysqldump -u henk -p birdhouse > /opt/backups/birdhouse_$(date +%Y%m%d_%H%M%S).sql

# Backup application
sudo cp -r /opt/birdhouse-viewer /opt/backups/birdhouse-viewer_$(date +%Y%m%d_%H%M%S)

# Backup systemd services
sudo cp /etc/systemd/system/birdhouse-backend.service /opt/backups/
sudo cp /etc/systemd/system/motion-notification.service /opt/backups/ 2>/dev/null || true
```

### 2. Install ffmpeg (if not already installed)

```bash
# Check if ffmpeg is installed
ffmpeg -version

# If not installed:
sudo apt update
sudo apt install -y ffmpeg

# Verify installation
ffmpeg -version
```

### 3. Stop Current Services

```bash
sudo systemctl stop birdhouse-backend
sudo systemctl stop motion-notification 2>/dev/null || true
```

### 4. Deploy New Files

```bash
# Extract deployment package
cd /tmp
tar -xzf birdhouse-motion-video-feature.tar.gz

# Copy new files
sudo cp -r motion-video-deployment/* /opt/birdhouse-viewer/

# Set ownership
sudo chown -R henk:henk /opt/birdhouse-viewer

# Create videos directory
sudo mkdir -p /opt/birdhouse-viewer/videos
sudo chown henk:henk /opt/birdhouse-viewer/videos
sudo chmod 755 /opt/birdhouse-viewer/videos
```

### 5. Update Database Schema

```bash
cd /opt/birdhouse-viewer

# Push database changes
pnpm db:push

# Verify new table exists
mysql -u henk -p birdhouse -e "DESCRIBE motionVideos;"
```

Expected output:
```
+---------------+--------------+------+-----+-------------------+-------------------+
| Field         | Type         | Null | Key | Default           | Extra             |
+---------------+--------------+------+-----+-------------------+-------------------+
| id            | int          | NO   | PRI | NULL              | auto_increment    |
| deviceId      | int          | NO   | MUL | NULL              |                   |
| motionEventId | int          | YES  | MUL | NULL              |                   |
| filename      | varchar(255) | NO   | UNI | NULL              |                   |
| filepath      | varchar(512) | NO   |     | NULL              |                   |
| duration      | int          | NO   |     | 5                 |                   |
| filesize      | int          | NO   |     | NULL              |                   |
| capturedAt    | timestamp    | NO   |     | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| createdAt     | timestamp    | NO   |     | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
+---------------+--------------+------+-----+-------------------+-------------------+
```

### 6. Install Motion Video Capture Service

```bash
# Copy systemd service file
sudo cp /opt/birdhouse-viewer/motion-video-capture.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable motion-video-capture

# Check service file
sudo systemctl cat motion-video-capture
```

### 7. Rebuild Backend

```bash
cd /opt/birdhouse-viewer

# Install any new dependencies
pnpm install

# Rebuild
pnpm run build:google
```

### 8. Start Services

```bash
# Start backend
sudo systemctl start birdhouse-backend

# Start motion video capture service
sudo systemctl start motion-video-capture

# Verify services are running
sudo systemctl status birdhouse-backend
sudo systemctl status motion-video-capture
```

### 9. Verify Installation

```bash
# Check backend logs
sudo journalctl -u birdhouse-backend -n 50 --no-pager

# Check motion video capture logs
sudo journalctl -u motion-video-capture -n 50 --no-pager

# Expected log output from motion-video-capture:
# "Starting Motion Video Capture Service"
# "Connected to MQTT broker"
# "Subscribed to device/+/motion"
# "Subscribed to device/+/stream"
```

### 10. Test the Feature

1. **Trigger motion detection** on one of your ESP32-CAM devices
2. **Check logs** for video capture activity:
   ```bash
   sudo journalctl -u motion-video-capture -f
   ```
3. **Expected log sequence:**
   ```
   Motion detected on birdhouse-0001
   Started video capture for birdhouse-0001
   Created MJPEG video: /opt/birdhouse-viewer/videos/birdhouse-0001_20251119_140530.mjpeg
   Successfully created video: birdhouse-0001_20251119_140530.mjpeg (50 frames, 245678 bytes)
   ```
4. **Access web interface** at https://birdhouse.bb36.org
5. **Navigate to "Motion Videos"** in the menu
6. **Verify video appears** in the gallery
7. **Click "Play"** to test video playback

---

## Rollback Procedure

If anything goes wrong, follow these steps to rollback:

### Quick Rollback (Restore from Backup)

```bash
# Stop new services
sudo systemctl stop birdhouse-backend
sudo systemctl stop motion-video-capture
sudo systemctl disable motion-video-capture

# Restore application files
sudo rm -rf /opt/birdhouse-viewer
sudo cp -r /opt/backups/birdhouse-viewer_YYYYMMDD_HHMMSS /opt/birdhouse-viewer
sudo chown -R henk:henk /opt/birdhouse-viewer

# Restore database
mysql -u henk -p birdhouse < /opt/backups/birdhouse_YYYYMMDD_HHMMSS.sql

# Restore systemd service
sudo cp /opt/backups/birdhouse-backend.service /etc/systemd/system/
sudo systemctl daemon-reload

# Start old backend
sudo systemctl start birdhouse-backend

# Verify
sudo systemctl status birdhouse-backend
```

### Partial Rollback (Keep Database, Disable New Service)

If the database migration succeeded but the service has issues:

```bash
# Stop and disable motion video capture
sudo systemctl stop motion-video-capture
sudo systemctl disable motion-video-capture

# The system will continue to work without video capture
# Motion notifications will still function normally
```

---

## Configuration

### Environment Variables

The motion video capture service uses these environment variables from `/opt/birdhouse-viewer/.env`:

```bash
# MQTT Configuration
MQTT_BROKER=192.168.2.1
MQTT_PORT=1883
MQTT_USER=henk
MQTT_PASSWORD=henk6697

# Database Configuration (uses DATABASE_URL)
DATABASE_URL=mysql://henk:password@localhost:3306/birdhouse
```

### Adjusting Video Settings

Edit `/opt/birdhouse-viewer/motion_video_capture.py`:

```python
VIDEO_DURATION = 5  # seconds - change to capture longer/shorter videos
FRAME_RATE = 10     # fps - higher = smoother but larger files
MAX_VIDEOS = 50     # maximum videos per device before cleanup
```

After changes:
```bash
sudo systemctl restart motion-video-capture
```

---

## Monitoring

### Check Service Status

```bash
# Backend
sudo systemctl status birdhouse-backend

# Motion video capture
sudo systemctl status motion-video-capture

# View logs
sudo journalctl -u motion-video-capture -f
```

### Check Disk Usage

```bash
# Check videos directory size
du -sh /opt/birdhouse-viewer/videos

# List videos
ls -lh /opt/birdhouse-viewer/videos
```

### Database Queries

```bash
# Count videos per device
mysql -u henk -p birdhouse -e "
SELECT d.name, d.deviceId, COUNT(mv.id) as video_count, 
       SUM(mv.filesize) as total_bytes
FROM devices d
LEFT JOIN motionVideos mv ON d.id = mv.deviceId
GROUP BY d.id;
"

# Recent videos
mysql -u henk -p birdhouse -e "
SELECT filename, capturedAt, filesize 
FROM motionVideos 
ORDER BY capturedAt DESC 
LIMIT 10;
"
```

---

## Troubleshooting

### Videos Not Being Captured

1. **Check motion video capture service is running:**
   ```bash
   sudo systemctl status motion-video-capture
   ```

2. **Check MQTT connection:**
   ```bash
   sudo journalctl -u motion-video-capture | grep "Connected to MQTT"
   ```

3. **Verify motion events are being published:**
   ```bash
   mosquitto_sub -h 192.168.2.1 -t "device/+/motion" -v
   ```

4. **Check ESP32-CAM is publishing to correct topic:**
   - Motion events: `device/birdhouse-XXXX/motion` with payload `detected`
   - Stream frames: `device/birdhouse-XXXX/stream` with JSON payload

### Videos Not Playing in Browser

1. **Check video file exists:**
   ```bash
   ls -lh /opt/birdhouse-viewer/videos
   ```

2. **Check file permissions:**
   ```bash
   sudo chmod 644 /opt/birdhouse-viewer/videos/*.mjpeg
   ```

3. **Check browser console** (F12) for errors

4. **Verify video route is accessible:**
   ```bash
   curl -I http://localhost:3000/api/videos/1
   ```

### ffmpeg Errors

1. **Check ffmpeg is installed:**
   ```bash
   which ffmpeg
   ffmpeg -version
   ```

2. **Check ffmpeg can write to videos directory:**
   ```bash
   sudo -u henk ffmpeg -f lavfi -i testsrc=duration=1:size=320x240:rate=10 \
     /opt/birdhouse-viewer/videos/test.mjpeg
   ```

3. **Check logs for ffmpeg errors:**
   ```bash
   sudo journalctl -u motion-video-capture | grep "ffmpeg"
   ```

### Database Issues

1. **Verify motionVideos table exists:**
   ```bash
   mysql -u henk -p birdhouse -e "SHOW TABLES LIKE 'motionVideos';"
   ```

2. **Check for foreign key errors:**
   ```bash
   sudo journalctl -u motion-video-capture | grep "Error"
   ```

---

## Performance Considerations

### Disk Space

- Each 5-second video at 10fps ≈ 200-500 KB
- 50 videos per device ≈ 10-25 MB per device
- 10 devices ≈ 100-250 MB total
- Monitor with: `df -h /opt/birdhouse-viewer/videos`

### Network Bandwidth

- Video capture uses existing MQTT stream
- No additional bandwidth during non-motion periods
- During motion: ~50 KB/s for 5 seconds = ~250 KB per event

### CPU Usage

- ffmpeg conversion: ~1-2 seconds per video
- Minimal impact on ESP32-CAM (already streaming)
- Backend: negligible impact

---

## Security Notes

1. **Video files are protected by authentication** - only device owners can access
2. **Videos are stored locally** on the server, not in cloud
3. **HTTPS recommended** for production (already configured)
4. **Regular backups** of `/opt/birdhouse-viewer/videos` recommended

---

## Maintenance

### Weekly Tasks

```bash
# Check disk usage
du -sh /opt/birdhouse-viewer/videos

# Check service health
sudo systemctl status motion-video-capture
```

### Monthly Tasks

```bash
# Backup videos directory
tar -czf /opt/backups/videos_$(date +%Y%m%d).tar.gz \
  /opt/birdhouse-viewer/videos

# Clean up old backups (keep last 3 months)
find /opt/backups -name "videos_*.tar.gz" -mtime +90 -delete
```

---

## Support

For issues or questions:
1. Check logs: `sudo journalctl -u motion-video-capture -n 100`
2. Verify configuration in `.env` file
3. Test with manual motion trigger
4. Check ESP32-CAM Serial Monitor output

---

## Summary of Changes

### Files Added
- `motion_video_capture.py` - Video capture service
- `motion-video-capture.service` - Systemd service file
- `server/videoRoutes.ts` - Express routes for serving videos
- `client/src/pages/Videos.tsx` - Video gallery page

### Files Modified
- `drizzle/schema.ts` - Added motionVideos table
- `server/db.ts` - Added video database helpers
- `server/routers.ts` - Added videos tRPC router
- `server/_core/index-google.ts` - Added video routes
- `client/src/App.tsx` - Added /videos route
- `client/src/pages/Home.tsx` - Added Motion Videos link

### Database Changes
- New table: `motionVideos`
- No changes to existing tables (backward compatible)

### System Services
- New service: `motion-video-capture.service`
- Existing services: unchanged (backward compatible)

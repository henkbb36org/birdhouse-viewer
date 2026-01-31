import { Router } from 'express';
import { getMotionVideoById } from './db';
import { getDeviceById } from './db';
import path from 'path';
import fs from 'fs';

export const videoRouter = Router();

/**
 * Serve motion video files
 * GET /api/videos/:videoId
 */
videoRouter.get('/:videoId', async (req, res) => {
  try {
    const videoId = parseInt(req.params.videoId);
    
    if (isNaN(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }
    
    // Get video metadata
    const video = await getMotionVideoById(videoId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Verify user owns the device (check session)
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const device = await getDeviceById(video.deviceId);
    if (!device || device.userId !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Check if file exists
    if (!fs.existsSync(video.filepath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }
    
    // Get file stats
    const stat = fs.statSync(video.filepath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      // Handle range requests for video seeking
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(video.filepath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/x-motion-jpeg',
      };
      
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Serve entire file
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/x-motion-jpeg',
        'Accept-Ranges': 'bytes',
      };
      
      res.writeHead(200, head);
      fs.createReadStream(video.filepath).pipe(res);
    }
  } catch (error) {
    console.error('Error serving video:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

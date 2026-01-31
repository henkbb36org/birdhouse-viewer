# Device Sharing Feature

The Birdhouse Viewer now supports sharing devices between multiple users, allowing family members to view the same birdhouse camera while each using their own Google account.

## Overview

Device sharing enables:
- **Multiple viewers** - Share a birdhouse camera with family members
- **Individual accounts** - Each person uses their own Google account
- **Shared notifications** - All users with access receive motion detection alerts
- **Owner control** - Only the device owner can manage sharing settings and delete devices
- **Easy management** - Share by email address with a simple dialog

## How It Works

### Device Ownership

- When you register a device, you become the **owner**
- Owners have full control: view streams, manage sharing, delete device
- Owners see an "Owner" badge on their device cards

### Sharing a Device

1. Navigate to the **Devices** page
2. Find the device you want to share
3. Click the **Share** button (share icon)
4. Enter the email address of the person you want to share with
5. Click **Share**

**Important:** The person must have signed in to the app at least once before you can share with them.

### Viewing Shared Devices

- Shared devices appear in your device list with a "Shared" badge
- You can view streams and receive notifications
- You cannot delete shared devices (only the owner can)
- Click the Share button to see you have viewer access

### Removing Access

**As the owner:**
1. Click the Share button on the device
2. Find the user in the "Shared With" list
3. Click the trash icon next to their name
4. Confirm the removal

## Features Available to Shared Users

### ✅ What Shared Users Can Do:
- View live camera streams
- Receive motion detection push notifications
- View motion detection history
- Watch recorded motion videos
- Enable/disable their own notifications

### ❌ What Shared Users Cannot Do:
- Delete the device
- Share the device with others (only owner can share)
- Modify device settings
- Change device name or description

## Technical Details

### Database Schema

The sharing feature uses a junction table `deviceShares`:

```sql
CREATE TABLE deviceShares (
  id INT PRIMARY KEY AUTO_INCREMENT,
  deviceId INT NOT NULL,
  userId INT NOT NULL,
  role ENUM('owner', 'viewer') DEFAULT 'viewer',
  sharedBy INT NOT NULL,
  sharedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deviceId) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sharedBy) REFERENCES users(id) ON DELETE CASCADE
);
```

The `devices` table was updated to use `ownerId` instead of `userId` to clarify ownership.

### Authorization

All device-related operations check authorization:

- **View/Stream**: Owner OR shared user
- **Share/Unshare**: Owner only
- **Delete**: Owner only

### Notifications

When motion is detected:
1. System queries all users with access to the device (owner + shared users)
2. Push notifications are sent to all users' registered devices
3. Each user receives the notification independently

## API Endpoints

### tRPC Procedures

**Share a device:**
```typescript
trpc.sharing.shareDevice.useMutation({
  deviceId: number,
  email: string
})
```

**Unshare a device:**
```typescript
trpc.sharing.unshareDevice.useMutation({
  deviceId: number,
  userId: number
})
```

**Get shared users:**
```typescript
trpc.sharing.getSharedUsers.useQuery({
  deviceId: number
})
```

## Use Cases

### Family Birdhouse Monitoring

**Scenario:** A family has a birdhouse in their backyard. Both parents and their adult children want to monitor it.

**Solution:**
1. One person (e.g., Dad) registers the ESP32-CAM device
2. Dad shares the device with Mom's email
3. Dad shares the device with each child's email
4. Everyone can now view the stream and receive notifications on their own phones

### Multiple Properties

**Scenario:** You have birdhouses at your home and at your parents' house.

**Solution:**
1. Register your home birdhouse with your account
2. Register your parents' birdhouse with their account
3. They share their device with your email
4. You can now monitor both birdhouses from your account

### Vacation Monitoring

**Scenario:** You're on vacation and want a neighbor to check on your birdhouse.

**Solution:**
1. Share your birdhouse device with your neighbor's email
2. They can view the stream while you're away
3. When you return, remove their access

## Privacy & Security

- **Email-based sharing** - Only users with registered accounts can be added
- **Owner control** - Only the device owner can manage sharing
- **Revocable access** - Owner can remove access at any time
- **Individual authentication** - Each user must sign in with their own Google account
- **Secure streams** - All video streams are transmitted over secure WebSocket (WSS)

## Migration from Previous Version

If you're upgrading from a previous version:

1. **Database migration** - The `userId` column in `devices` table was renamed to `ownerId`
2. **Existing devices** - All existing devices remain owned by their original user
3. **No data loss** - All device data, videos, and settings are preserved
4. **Backward compatible** - Existing functionality continues to work

## Troubleshooting

### "User with this email not found"

**Problem:** You're trying to share with someone who hasn't signed in yet.

**Solution:** Ask them to:
1. Visit the Birdhouse Viewer app
2. Sign in with their Google account
3. After they've signed in once, you can share with their email

### "Cannot share device with yourself"

**Problem:** You entered your own email address.

**Solution:** You already own the device, no need to share with yourself.

### "Device already shared with this user"

**Problem:** The device is already shared with this email.

**Solution:** The user already has access. Check the "Shared With" list to verify.

### Shared user can't see the device

**Possible causes:**
1. They haven't refreshed their device list (reload the page)
2. The share wasn't successful (check the "Shared With" list)
3. They're signed in with a different email address

## Best Practices

1. **Share with trusted users only** - Anyone with access can view your camera streams
2. **Use the correct email** - Make sure you're using the email they signed in with
3. **Review shared users periodically** - Remove access for users who no longer need it
4. **One owner per device** - Only the original registrant can manage sharing
5. **Test notifications** - After sharing, have the other user test that they receive notifications

## Future Enhancements

Potential future features:
- **Share expiration** - Automatically remove access after a set time
- **Permission levels** - Different access levels (view-only, full access, etc.)
- **Share codes** - Alternative sharing method using 6-digit codes
- **Email notifications** - Notify users when a device is shared with them
- **Activity log** - Track who accessed the device and when

## Support

For issues or questions about device sharing:
1. Check this documentation
2. Review the troubleshooting section
3. Verify both users have signed in at least once
4. Check the browser console for errors
5. Review server logs: `sudo journalctl -u birdhouse-backend -n 100`

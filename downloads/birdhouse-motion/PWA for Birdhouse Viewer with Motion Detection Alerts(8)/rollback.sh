#!/bin/bash
#
# Rollback Script for Motion Video Capture Feature
# Usage: sudo ./rollback.sh [backup_timestamp]
#
# Example: sudo ./rollback.sh 20251119_140000
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Birdhouse Viewer - Rollback Script${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
   exit 1
fi

# Get backup timestamp
BACKUP_TIMESTAMP=$1

if [ -z "$BACKUP_TIMESTAMP" ]; then
    echo "Available backups:"
    ls -1 /opt/backups/ | grep "birdhouse-viewer_" | sed 's/birdhouse-viewer_//'
    echo ""
    read -p "Enter backup timestamp (YYYYMMDD_HHMMSS): " BACKUP_TIMESTAMP
fi

BACKUP_DIR="/opt/backups/birdhouse-viewer_${BACKUP_TIMESTAMP}"
BACKUP_SQL="/opt/backups/birdhouse_${BACKUP_TIMESTAMP}.sql"

# Verify backups exist
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}Error: Application backup not found: $BACKUP_DIR${NC}"
    exit 1
fi

if [ ! -f "$BACKUP_SQL" ]; then
    echo -e "${YELLOW}Warning: Database backup not found: $BACKUP_SQL${NC}"
    read -p "Continue without database rollback? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    SKIP_DB=true
fi

echo -e "${YELLOW}Rollback Plan:${NC}"
echo "  Application: $BACKUP_DIR"
if [ "$SKIP_DB" != "true" ]; then
    echo "  Database: $BACKUP_SQL"
else
    echo "  Database: SKIP"
fi
echo ""
read -p "Proceed with rollback? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled."
    exit 0
fi

echo ""
echo -e "${GREEN}Step 1: Stopping services...${NC}"
systemctl stop birdhouse-backend
systemctl stop motion-video-capture 2>/dev/null || true
systemctl disable motion-video-capture 2>/dev/null || true

echo -e "${GREEN}Step 2: Backing up current state (just in case)...${NC}"
EMERGENCY_BACKUP="/opt/backups/emergency_$(date +%Y%m%d_%H%M%S)"
cp -r /opt/birdhouse-viewer "$EMERGENCY_BACKUP"
echo "Emergency backup saved to: $EMERGENCY_BACKUP"

echo -e "${GREEN}Step 3: Restoring application files...${NC}"
rm -rf /opt/birdhouse-viewer
cp -r "$BACKUP_DIR" /opt/birdhouse-viewer
chown -R henk:henk /opt/birdhouse-viewer

if [ "$SKIP_DB" != "true" ]; then
    echo -e "${GREEN}Step 4: Restoring database...${NC}"
    mysql -u henk -p birdhouse < "$BACKUP_SQL"
else
    echo -e "${YELLOW}Step 4: Skipping database restore${NC}"
fi

echo -e "${GREEN}Step 5: Restoring systemd service...${NC}"
if [ -f "/opt/backups/birdhouse-backend.service" ]; then
    cp /opt/backups/birdhouse-backend.service /etc/systemd/system/
    systemctl daemon-reload
fi

echo -e "${GREEN}Step 6: Starting backend service...${NC}"
systemctl start birdhouse-backend

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Rollback completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Verification steps:"
echo "  1. Check backend status: systemctl status birdhouse-backend"
echo "  2. Check backend logs: journalctl -u birdhouse-backend -n 50"
echo "  3. Access web interface: https://birdhouse.bb36.org"
echo ""
echo "Note: Motion video capture service has been disabled."
echo "The system is now running the previous version."
echo ""

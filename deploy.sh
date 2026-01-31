#!/bin/bash
#
# Birdhouse Viewer Deployment Script
#
# This script automates the deployment of the Birdhouse Viewer application
# on a Linux server with Apache, MySQL, and Mosquitto.
#
# Usage:
#   chmod +x deploy.sh
#   sudo ./deploy.sh
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/birdhouse-viewer"
APACHE_SITES="/etc/apache2/sites-available"
SYSTEMD_DIR="/etc/systemd/system"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Birdhouse Viewer Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: Please run as root (use sudo)${NC}"
    exit 1
fi

# Check if project directory exists
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Warning: Installation directory $INSTALL_DIR does not exist${NC}"
    echo -e "${YELLOW}Please upload the project files to $INSTALL_DIR first${NC}"
    exit 1
fi

# Step 1: Install system dependencies
echo -e "${GREEN}Step 1: Checking system dependencies...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found. Installing...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
else
    echo -e "${GREEN}✓ Node.js is installed ($(node --version))${NC}"
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}pnpm not found. Installing...${NC}"
    npm install -g pnpm
else
    echo -e "${GREEN}✓ pnpm is installed${NC}"
fi

# Check MySQL
if ! command -v mysql &> /dev/null; then
    echo -e "${RED}Error: MySQL is not installed${NC}"
    echo -e "${YELLOW}Please install MySQL first: sudo apt-get install mysql-server${NC}"
    exit 1
else
    echo -e "${GREEN}✓ MySQL is installed${NC}"
fi

# Check Apache
if ! command -v apache2 &> /dev/null; then
    echo -e "${RED}Error: Apache is not installed${NC}"
    echo -e "${YELLOW}Please install Apache first: sudo apt-get install apache2${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Apache is installed${NC}"
fi

# Check Mosquitto
if ! command -v mosquitto &> /dev/null; then
    echo -e "${RED}Error: Mosquitto is not installed${NC}"
    echo -e "${YELLOW}Please install Mosquitto first: sudo apt-get install mosquitto${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Mosquitto is installed${NC}"
fi

echo ""

# Step 2: Install project dependencies
echo -e "${GREEN}Step 2: Installing project dependencies...${NC}"
cd "$INSTALL_DIR"
sudo -u www-data pnpm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 3: Build the application
echo -e "${GREEN}Step 3: Building the application...${NC}"
sudo -u www-data pnpm build
echo -e "${GREEN}✓ Application built${NC}"
echo ""

# Step 4: Set up database
echo -e "${GREEN}Step 4: Database setup${NC}"
echo -e "${YELLOW}Please ensure you have:${NC}"
echo -e "${YELLOW}  1. Created a MySQL database named 'birdhouse'${NC}"
echo -e "${YELLOW}  2. Created a MySQL user with access to this database${NC}"
echo -e "${YELLOW}  3. Updated the .env file with DATABASE_URL${NC}"
echo ""
read -p "Have you completed the database setup? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Running database migrations...${NC}"
    cd "$INSTALL_DIR"
    sudo -u www-data pnpm db:push
    echo -e "${GREEN}✓ Database migrations completed${NC}"
else
    echo -e "${YELLOW}Skipping database migrations. Run 'pnpm db:push' manually after setup.${NC}"
fi
echo ""

# Step 5: Install systemd service
echo -e "${GREEN}Step 5: Installing systemd service...${NC}"
if [ -f "$INSTALL_DIR/deployment/birdhouse-backend.service" ]; then
    cp "$INSTALL_DIR/deployment/birdhouse-backend.service" "$SYSTEMD_DIR/"
    systemctl daemon-reload
    systemctl enable birdhouse-backend.service
    echo -e "${GREEN}✓ Systemd service installed${NC}"
else
    echo -e "${RED}Error: Service file not found at $INSTALL_DIR/deployment/birdhouse-backend.service${NC}"
fi
echo ""

# Step 6: Configure Apache
echo -e "${GREEN}Step 6: Configuring Apache...${NC}"

# Enable required modules
echo -e "${YELLOW}Enabling Apache modules...${NC}"
a2enmod proxy proxy_http proxy_wstunnel rewrite headers
echo -e "${GREEN}✓ Apache modules enabled${NC}"

# Copy virtual host configuration
if [ -f "$INSTALL_DIR/deployment/apache-birdhouse.conf" ]; then
    cp "$INSTALL_DIR/deployment/apache-birdhouse.conf" "$APACHE_SITES/birdhouse.conf"
    echo -e "${YELLOW}Please edit $APACHE_SITES/birdhouse.conf and update ServerName${NC}"
    echo ""
    read -p "Press Enter after editing the Apache configuration..."
    
    # Enable the site
    a2ensite birdhouse.conf
    echo -e "${GREEN}✓ Apache virtual host configured${NC}"
else
    echo -e "${RED}Error: Apache config file not found${NC}"
fi
echo ""

# Step 7: Set permissions
echo -e "${GREEN}Step 7: Setting file permissions...${NC}"
chown -R www-data:www-data "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"
echo -e "${GREEN}✓ Permissions set${NC}"
echo ""

# Step 8: Start services
echo -e "${GREEN}Step 8: Starting services...${NC}"

# Start backend
systemctl start birdhouse-backend.service
if systemctl is-active --quiet birdhouse-backend.service; then
    echo -e "${GREEN}✓ Backend service started${NC}"
else
    echo -e "${RED}✗ Backend service failed to start${NC}"
    echo -e "${YELLOW}Check logs with: sudo journalctl -u birdhouse-backend.service -n 50${NC}"
fi

# Reload Apache
systemctl reload apache2
if systemctl is-active --quiet apache2; then
    echo -e "${GREEN}✓ Apache reloaded${NC}"
else
    echo -e "${RED}✗ Apache failed to reload${NC}"
fi

# Check Mosquitto
if systemctl is-active --quiet mosquitto; then
    echo -e "${GREEN}✓ Mosquitto is running${NC}"
else
    echo -e "${YELLOW}Starting Mosquitto...${NC}"
    systemctl start mosquitto
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Test the application by visiting http://your-server-ip"
echo "2. Configure SSL with: sudo certbot --apache -d your-domain.com"
echo "3. Update MQTT WebSocket URL in the application if needed"
echo "4. Start the motion notification handler if not already running"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "  Check backend status: sudo systemctl status birdhouse-backend.service"
echo "  View backend logs: sudo journalctl -u birdhouse-backend.service -f"
echo "  Restart backend: sudo systemctl restart birdhouse-backend.service"
echo "  Check Apache logs: sudo tail -f /var/log/apache2/birdhouse-error.log"
echo ""

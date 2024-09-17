#!/bin/bash

set -e

# Step 1: Update package list
echo "Updating package list..."
sudo apt-get update -y

# Step 2: Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing Docker..."
    sudo apt-get install -y apt-transport-https ca-certificates curl gnupg-agent software-properties-common
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
    sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
    echo "Docker installed. Please log out and log back in to apply the Docker group changes."
else
    echo "Docker is already installed."
fi

# Step 3: Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "Nginx not found. Installing Nginx..."
    sudo apt-get install -y nginx
    sudo systemctl start nginx
    sudo systemctl enable nginx
else
    echo "Nginx is already installed."
fi

# Step 4: Configure Nginx for Node.js app
echo "Configuring Nginx to serve Node.js app..."

# Remove default Nginx configuration
sudo rm /etc/nginx/sites-enabled/default

cat <<EOF | sudo tee /etc/nginx/sites-available/api.mdrijonhossainjibonyt.xyz
server {
    listen 80;
    server_name api.mdrijonhossainjibonyt.xyz;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable the Nginx configuration
echo "Enabling Nginx configuration..."
sudo ln -s /etc/nginx/sites-available/api.mdrijonhossainjibonyt.xyz/etc/nginx/sites-enabled/

# Test Nginx configuration
echo "Testing Nginx configuration..."
sudo nginx -t

# Reload Nginx
echo "Reloading Nginx..."
sudo systemctl reload nginx

echo "Nginx has been configured to serve your Node.js app."

# Step 5: Build Docker image for Node.js app
echo "Building Docker image..."
cat <<EOF > Dockerfile
FROM node:alpine

WORKDIR /app

COPY . .

RUN yarn install && yarn dev

EXPOSE 3000

CMD ["yarn", "start"]
EOF

# Step 6: Stop and remove existing Docker container
echo "Stopping and removing existing Docker container..."
sudo docker stop wallet-rpc &>/dev/null || true
sudo docker rm wallet-rpc &>/dev/null || true
sudo docker build -t wallet-rpc .

# Step 7: Run Docker container for Node.js app
echo "Running Docker container for Node.js app..."
sudo docker run -d --name wallet-rpc -p 3000:3000 wallet-rpc

# Step 8: Set up Docker Compose for MongoDB
echo "Setting up Docker Compose for MongoDB..."
cat <<EOF > docker-compose.yml
version: '3.3'

services:
  mongodb:
    image: mongo
    container_name: mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: root
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:
EOF

echo "Starting MongoDB with Docker Compose..."
sudo docker-compose up -d

echo "Setup complete. Please log out and log back in to apply Docker group changes."

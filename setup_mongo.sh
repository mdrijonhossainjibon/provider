#!/bin/bash

 

# Create a Docker Compose YAML file
cat <<EOF > docker-compose.yml
version: '3.8'

services:
  mongodb:
    image: mongo:latest
    container_name: mongodb
    restart: always
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:
    driver: local
EOF

# Run Docker Compose to start MongoDB
docker-compose up -d

echo "MongoDB Docker container setup completed with user 'root' and password 'root'."

# Use an official Node runtime as a parent image
FROM node:18-alpine AS base

# Set environment variables for production
ENV NODE_ENV=production

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy the rest of the application code
COPY . .

# Expose the backend port (adjust if needed)
EXPOSE 3001

# Start the application
CMD ["node", "server.js"]

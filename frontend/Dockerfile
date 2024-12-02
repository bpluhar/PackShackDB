# Stage 1: Build the application
FROM node:18-alpine as build

# Install dependencies required for node-gyp and other build tools
RUN apk add --no-cache \
  python3 \
  make \
  g++

# Create app directory
WORKDIR /app

# Copy package files to install dependencies
COPY package*.json ./

# Install dependencies in the build environment
RUN npm ci

# Copy the rest of the application source code
COPY . .

# Build the application for production
RUN npm run build

# Stage 2: Create the production image with only the build output
FROM node:18-alpine as production

# Create app directory in the production stage
WORKDIR /app

# Copy only the build output to the production image
COPY --from=build /app/build /app/build

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

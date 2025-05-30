FROM node:16-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Create a .env file if it doesn't exist
RUN touch .env

# Run the app
CMD ["node", "BatchFeesCollector.js"] 
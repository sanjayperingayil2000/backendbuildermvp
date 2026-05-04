# api/Dockerfile

FROM node:20-alpine

WORKDIR /app

# Copy package files first (Docker caches this layer)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the source code
COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
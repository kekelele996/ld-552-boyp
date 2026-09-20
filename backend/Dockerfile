FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace backend
COPY backend ./backend
WORKDIR /app/backend
RUN npx prisma generate && npm run build
CMD ["sh","-c","npx prisma migrate deploy && npm run prisma:seed && node dist/src/main.js"]

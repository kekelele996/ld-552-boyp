FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm install --workspace frontend --include=optional && \
    case "$(uname -m)" in \
      aarch64) npm install --no-save @rolldown/binding-linux-arm64-musl@1.0.3 lightningcss-linux-arm64-musl@1.32.0 ;; \
      x86_64) npm install --no-save @rolldown/binding-linux-x64-musl@1.0.3 lightningcss-linux-x64-musl@1.32.0 ;; \
      *) echo "Unsupported build architecture: $(uname -m)" && exit 1 ;; \
    esac
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm run build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

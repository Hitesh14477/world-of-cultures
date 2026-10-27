FROM node:22-alpine AS frontend-build
WORKDIR /workspace/frontend/vite-project
COPY frontend/vite-project/package*.json ./
RUN npm ci
COPY frontend/vite-project/ ./
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:1.27-alpine AS frontend
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /workspace/frontend/vite-project/dist /usr/share/nginx/html
EXPOSE 80 443

FROM node:22-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
EXPOSE 5001
CMD ["npm", "start"]

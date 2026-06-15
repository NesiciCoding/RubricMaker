FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Optional: pre-fill the DB connection form in Settings > Database.
# Set via docker-compose build args or --build-arg flags.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# Optional: enables the client_logs diagnostic stream for a stress-test window.
ARG VITE_STRESS_TEST_LOGGING
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

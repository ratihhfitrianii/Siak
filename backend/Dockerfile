# ---- Stage 1: build (with devDependencies for migrations) ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY backend/src ./backend/src
COPY backend/migrations ./backend/migrations
COPY backend/database.json ./backend/database.json
COPY backend/src/modules/waiting-room/waiting-room.lua ./backend/src/modules/waiting-room/
RUN npm run build --workspace=backend

# ---- Stage 2: migrate runner (includes devDependencies) ----
FROM node:22-alpine AS migrate
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci

COPY backend/migrations ./backend/migrations
COPY backend/database.json ./backend/database.json
COPY --from=build /app/backend/dist ./backend/dist

CMD ["npm", "run", "migrate:up", "--workspace=backend"]

# ---- Stage 3: runtime (produksi — deps produksi saja) ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/src/modules/waiting-room/waiting-room.lua ./backend/dist/modules/waiting-room/

EXPOSE 3000
USER node
CMD ["node", "backend/dist/index.js"]
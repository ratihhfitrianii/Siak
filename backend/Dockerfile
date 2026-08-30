# ---- Stage 1: build (with devDependencies for migrations) ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY migrations ./migrations
COPY database.json ./
COPY src/modules/waiting-room/waiting-room.lua ./src/modules/waiting-room/
RUN npm run build

# ---- Stage 2: migrate runner (includes devDependencies) ----
FROM node:22-alpine AS migrate
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY migrations ./migrations
COPY database.json ./
COPY --from=build /app/dist ./dist

CMD ["npm", "run", "migrate:up"]

# ---- Stage 3: runtime (produksi — deps produksi saja) ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/modules/waiting-room/waiting-room.lua ./dist/modules/waiting-room/

EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
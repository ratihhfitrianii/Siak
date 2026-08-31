# ---- Stage 1: build (with devDependencies for migrations) ----
FROM node:22-alpine AS build
WORKDIR /app

COPY .npmrc ./
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY migrations ./migrations
COPY database.json ./
COPY src/modules/waiting-room/waiting-room.lua ./src/modules/waiting-room/
RUN npm run build

# ---- Stage 2: migrate runner (uses ensure-tables to avoid node-pg-migrate conflicts) ----
FROM node:22-alpine AS migrate
WORKDIR /app

COPY .npmrc ./
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY scripts ./scripts
COPY --from=build /app/dist ./dist

CMD ["npm", "run", "ensure-tables"]

# ---- Stage 3: runtime (produksi — deps produksi saja) ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY .npmrc ./
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/modules/waiting-room/waiting-room.lua ./dist/modules/waiting-room/

EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]

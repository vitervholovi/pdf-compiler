# ── Build client (Vite) ─────────────────────────────────────────────────────
FROM node:20-bookworm AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm ci --workspace=client --workspace=server --include-workspace-root

COPY client ./client
COPY server ./server

ARG VITE_BASE=/temecriack/pdf-compiler/
ENV VITE_BASE=$VITE_BASE

RUN npm run build -w client

# ── Runtime (LibreOffice + Express) ─────────────────────────────────────────
FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    djvulibre-bin \
    fonts-dejavu \
    fonts-liberation \
    qpdf \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Production deps only (no Vite / concurrently). Workspaces still need both
# package.json files present for npm to resolve the lockfile.
RUN npm ci --omit=dev --workspace=server --include-workspace-root \
    && npm prune --omit=dev

COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3080
ENV CLIENT_DIST=/app/client/dist
ENV PUBLIC_BASE=/temecriack/pdf-compiler

EXPOSE 3080

CMD ["npm", "run", "start", "-w", "server"]

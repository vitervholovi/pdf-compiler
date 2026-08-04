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
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm install --workspace=client --workspace=server --include-workspace-root

COPY client ./client
COPY server ./server

ARG VITE_BASE=/pdf-compiler/
ENV VITE_BASE=$VITE_BASE

RUN npm run build -w client

ENV NODE_ENV=production
ENV PORT=3080
ENV CLIENT_DIST=/app/client/dist
ENV PUBLIC_BASE=/pdf-compiler

EXPOSE 3080

CMD ["npm", "run", "start", "-w", "server"]

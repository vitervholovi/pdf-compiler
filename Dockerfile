FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    djvulibre-bin \
    fonts-dejavu \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm install --workspace=client --workspace=server --include-workspace-root

COPY client ./client
COPY server ./server

RUN npm run build -w client

ENV NODE_ENV=production
ENV PORT=3080
ENV CLIENT_DIST=/app/client/dist

EXPOSE 3080

CMD ["npm", "run", "start", "-w", "server"]

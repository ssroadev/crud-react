
FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./backend/

RUN cd backend && npm ci --omit=dev

COPY backend ./backend
COPY shared ./shared

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

CMD ["node", "server.js"]

# Single-origin image: builds the client and serves it + the API + WebSocket from
# one Node process (one HTTPS URL for the whole Telegram Mini App).
FROM node:20-slim
WORKDIR /app

COPY . .
RUN npm install && npm run build --workspace client

ENV PORT=3001
# For testing inside Telegram without a bot token. Set BOT_TOKEN (and remove this)
# for a real deployment so initData is cryptographically verified.
ENV ALLOW_DEV_AUTH=1

EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "server"]

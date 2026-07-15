FROM node:22-alpine

WORKDIR /app
COPY server.mjs /app/server.mjs

ENV NODE_ENV=production
ENV PORT=3000

USER node
EXPOSE 3000

CMD ["node", "/app/server.mjs"]

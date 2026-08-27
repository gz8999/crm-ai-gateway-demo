FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8790
ENV VITE_FEATURE_DEEP_ANALYSIS=true

RUN npm run build

EXPOSE 8790

CMD ["node", "server/index.mjs"]

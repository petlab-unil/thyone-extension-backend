FROM node:12.16.1

ENV NODE_ENV=production
WORKDIR /app

COPY src .
COPY package.json .
COPY tsconfig.json .

RUN npm i
RUN npm i -g typescript
RUN tsc

EXPOSE 3000
CMD ["node", "dist/index.js"]

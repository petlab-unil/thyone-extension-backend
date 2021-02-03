FROM node:12.16.1

WORKDIR /app

COPY src .
COPY package.json .
COPY tsconfig.json .

RUN npm i

EXPOSE 3000
CMD ['npm', 'run', 'prod']

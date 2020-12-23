FROM node:14

ENV NODE_ENV=production
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH=$PATH:/home/node/.npm-global/bin

RUN echo "{}" > site.json && chown node:node site.json

RUN npm install -g ricochet-js pino-tiny pino-tee

WORKDIR /home/node
USER node

CMD ricochet | pino-tee info ./ricochet.log | pino-tiny

EXPOSE 4000

# docker build -t "ricochet:latest" .
# docker run -it --rm -e "SECRET=12345" --name "my-ricochet" ricochet:latest

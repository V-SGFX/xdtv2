# XDTV.FANS — obraz aplikacji (jschan/mchan).
# Na bazie docker/jschan/Dockerfile z mchan, ale na Node 20 LTS zamiast
# wygasłego Node 16 i z cache warstwy zależności.
FROM node:20-bookworm

RUN apt-get update -y \
 && apt-get install -y --no-install-recommends ffmpeg imagemagick graphicsmagick fontconfig fonts-dejavu \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g pm2 gulp-cli

WORKDIR /opt

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Sekrety czytane ze zmiennych środowiskowych (deploy/.env).
COPY ./docker/jschan/secrets.js ./configs/secrets.js

# Przy starcie, bo gulp łączy się z Redisem i Mongo, których nie ma podczas budowania:
#  - ikony z realfavicongenerator, tylko gdy ich brak,
#  - CSS/JS i strony do static/, montowanego z hosta (serwuje je systemowy nginx).
CMD ["/bin/sh", "-c", "[ -f gulp/res/icons/html_code.html ] || gulp generate-favicon; gulp && pm2-runtime start ecosystem.config.js --env production"]

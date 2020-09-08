FROM node:12.14.0
WORKDIR /opt
RUN apt-get update && apt-get install --assume-yes \
  aspell \
  jq \
  pandoc \
  python3-pip \
  texlive-base \
  texlive-fonts-extra \
  texlive-fonts-recommended \
  texlive-latex-extra \
  texlive-xetex
RUN pip3 install \
  mkdocs \
  mkdocs-material \
  pandoc-latex-admonition
RUN npm install -g \
  markdownlint-cli
COPY bin/docker-mkdocs /usr/local/sbin/mkdocs
COPY bin/docker-psp /usr/local/bin/psp
COPY . .
RUN yarn install
RUN chmod +x /usr/local/sbin/mkdocs /usr/local/bin/psp
